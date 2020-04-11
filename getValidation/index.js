// Requires //
const fs = require("fs");
const yoti = require("yoti");
const cosmos = require("@azure/cosmos");
const fetch = require("node-fetch");

// Yoti connection //
const CLIENT_SDK_ID = process.env["yoti_api_key"];
const PEM_KEY = process.env["yoti-pem"].replace(/\\n/gm, '\n');
const yotiClient = new yoti.Client(CLIENT_SDK_ID, PEM_KEY);
const disablePreviousAuthCheck = (process.env["yoti-previous-auth"] === "true") ? true : false;

// Database connection //
const endpoint = process.env.COSMOS_API_URL;
const masterKey = process.env.COSMOS_API_KEY;
const { CosmosClient } = cosmos;
const client = new CosmosClient({ endpoint: endpoint, key: masterKey });
const container = client
  .database("verificationDB")
  .container("verification-attempts");

// Other module connections //
const getUserServiceUrl = process.env.GET_USER_SERVICE_URL;
const putUserServiceUrl = process.env.PUT_USER_SERVICE_URL;
const userServiceKey = process.env.USER_SERVICE_KEY;

const datesMatch = function(date1, date2) {
  return date1.getDate() === date2.getDate() && date1.getMonth() === date2.getMonth() && date1.getFullYear() === date2.getFullYear();
};

const over18 = function(dateOfBirth) {
  const dateOfAcceptability = new Date(
    dateOfBirth.getFullYear() + 18,
    dateOfBirth.getMonth(),
    dateOfBirth.getDate()
  );
  const today = new Date();
  return today >= dateOfAcceptability;
};

const verify = function(user, yotiResponse) {
  var detail = {
    dob: datesMatch(user.userPersonalDetails.dateOfBirth, yotiResponse.dob),
    age: over18(user.userPersonalDetails.dateOfBirth),
    previousVerification: yotiIdMayBeUsed(yotiResponse.rememberMeId)
  };
  return {
    verified: detail.dob && detail.age && detail.previousVerification,
    results: results
  };
};

const storeAuditLog = async function(user, yotiResponse, verification, userServiceUpdated) {
  const summary = {
    timestamp: Date(),
    userId: user.id,
    rememberMeId: yotiResponse.rememberMeId,
    verified: verification.verified,
    verification: verification.detail,
    userServiceUpdated: userServiceUpdated
  };
  
  await container.items.insert(summary);
  
  return summary;
};

const updateUserModule = function(userId, verified) {
  fetch(putUserServiceUrl, {
    method: "PUT",
    mode: "same-origin",
    headers: {
      "Content-type": "application/json",
      "x-functions-key": userServiceKey,
      'cache-control': 'no-cache'
    },
    body: JSON.stringify({ UserId: userId, IsVerified: verified }) // Note updates verified status to true or false, null status indicates never attempted validation
  })
  .then(response => {
    response.json().then(json=>{
      return json.success;
    })
  });
};

const yotiIdMayBeUsed = async function(rememberMeId) {
  if (disablePreviousAuthCheck) {
    return true;
  }
  var query = "SELECT * FROM c WHERE c.rememberMeId = '" + rememberMeId + "' AND c.verified = true";
  var existingUsers = await container.items.query(query).fetchAll();
  return existingUsers.resources.length == 0;
};

const getYotiDetails = function(activityDetails) {
  const rememberMeId = activityDetails.getRememberMeId();
  const profile = activityDetails.getProfile();
  const dob = profile.getDateOfBirth().getValue();
  const fullName = profile.getFullName().getValue();
  return { name: fullName, dob: dob, rememberMeId: rememberMeId };
};

const getUser = async function(userId) { 
  var user = await fetch(getUserServiceUrl + "?ID=" + userId + "&code=" + userServiceKey, {
    method: "get",
    headers: {
      "content-type": "application/json"
    }
  });
  return user;
};


module.exports = function(context, req) {
  context.log("Processing request for UserID: %d", req.params.userId);
  context.log("Token: %s", req.params.token);

  context.log(getUserServiceUrl + "?ID=" + req.params.userId + "&code=" + userServiceKey);
  
  var statusCode = 500;
  var response = "";
  
  context.log("1");
  yotiClient.getActivityDetails(req.params.token).then((yotiActivityDetails) => {
    context.log("2");
    if (yotiActivityDetails == null) { throw new Error("Failed to decrypt token"); }
    var yotiResponse = getYotiDetails(yotiActivityDetails);
    context.log("3");
    var user = getUser(req.params.userId);
    if (user == null) { throw new Error("Failed to identify user"); }
    context.log(JSON.stringify(user));
    context.log("4");
    var verification = verify(user, yotiResponse);
    var userServiceUpdated = updateUserModule(user.userId, verification.verified);
    context.log("5");
    response = storeAuditLog(user, yotiResponse, verification, userServiceUpdated);
    statusCode = verification.verified && userServiceUpdated ? 200 : 401;
  }).catch ((error) => {
    context.log("ERROR!!");
    context.log.error(error.name + ": " + error.message);
    response = JSON.stringify({error: error});
  }).finally(() => {
    context.log("Finally");
    context.res = {
      status: statusCode,
      body: response,
      headers: {
        "Content-Type": "application/json"
      }
    }
    context.done();
  });
};
