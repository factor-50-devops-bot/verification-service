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

// HelpMyStreet Constants//
const ageLimit = 18; //current cutOff for age

const getValidationData = function(context, yotiResponse, user) {
  context.log("getValidationData");
  var userDob = new Date(user.userPersonalDetails.dateOfBirth);
  var yotiDob = new Date(yotiResponse.dob);
  var dobMatch = // Check yoti has given us a user with matching dob
    userDob.getDate() === yotiDob.getDate() &&
    userDob.getMonth() === yotiDob.getMonth() &&
    userDob.getFullYear() === yotiDob.getFullYear();
  var ageMatch = getUserAgeIsAcceptable(userDob, ageLimit); // Check user is old enough

  getRMIdNotAlreadyVerified(yotiResponse) // Check yotiId never used for successful validation before
    .then(results => {
      var userNotAlreadyVerified = results.resources.length < 1;
      var verificationObject = {
        dob: dobMatch,
        age: ageMatch,
        previousVerification: userNotAlreadyVerified
      };
      processValidation(user, context, yotiResponse, verificationObject);
    })
    .catch(function(error) {
      context.error("Cosmos fetch error: %s: %s", error.name, error.message);
      returnResponse(context, outputResponse, error);
    });
};

const processValidation = function(user, context, yotiResponse, verificationObject) {
  context.log("processValidation");
  var verified =
    verificationObject.dob &&
    verificationObject.age &&
    (verificationObject.previousVerification || disablePreviousAuthCheck);
  const outputResponse = {
    timestamp: Date(),
    userId: user.id,
    rememberMeId: yotiResponse.rememberMeId,
    verified: verified,
    verification: verificationObject
  };
  // Save audit record
  context.bindings.outputDocument = outputResponse;
  // Notify user service
  updateUserModule(user.id, context, verified);
};

const updateUserModule = function(userId, context, verified) {
  context.log("updateUserModule");
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
        if (json.success) {
            returnResponse(context, { userId: userId, verified: verified });
        } else{
            returnResponse(context, { userId: userId, verified: verified }, {error: "Could not update User"});
        }
      }
      )
    })
    .catch(function(error) {
      context.error("User Module update verification error: %s: %s", error.name, error.message);
      returnResponse(context, outputResponse, error);
    });
};

const returnResponse = function(context, response, responseError) {
  context.log("returnResponse");
  // Generate HTTP response
  var statusCode;
  if (responseError) {
    statusCode = 500;
    context.log(responseError);
  } else {
    statusCode = response.verified ? 200 : 401;
  }
  context.res = {
    status: statusCode,
    body: response,
    headers: {
      "Content-Type": "application/json"
    }
  };
};

const getUserAgeIsAcceptable = function(dateOfBirth, ageLimit) {
  context.log("getUserAgeIsAcceptable");
  const dateOfAcceptability = new Date(
    dateOfBirth.getFullYear() + ageLimit,
    dateOfBirth.getMonth(),
    dateOfBirth.getDate()
  );
  const today = new Date();
  return today >= dateOfAcceptability;
};

const getRMIdNotAlreadyVerified = function(yotiResponse) {
  context.log("getRMIdNotAlreadyVerified");
  var quotedYotiResponse = "'" + yotiResponse.rememberMeId + "'";
  var query =
    "SELECT * FROM c WHERE c.rememberMeId = " +
    quotedYotiResponse +
    " AND c.verified = true";

  return container.items.query(query).fetchAll();
};

const getYotiDetails = function(activityDetails) {
  context.log("getYotiDetails");
  if (activityDetails) {
    const rememberMeId = activityDetails.getRememberMeId();
    const profile = activityDetails.getProfile();
    const dob = profile.getDateOfBirth().getValue();
    const fullName = profile.getFullName().getValue();
    return { name: fullName, dob: dob, rememberMeId: rememberMeId };
  }
};

const getAllDetails = function(context, req, activityDetails) {
  context.log("getAllDetails");
  const yotiResponse = getYotiDetails(activityDetails);
  const user = fetch(getUserServiceUrl + "?ID=" + req.params.userId, {
    method: "get",
    headers: {
      "content-type": "application/json",
      "x-functions-key": userServiceKey
    }
  })
    .then(response =>
      response.json().then(user => {
        var person = user.user;
        getValidationData(context, yotiResponse, person);
      })
    )
    .catch(function(error) {
      context.error("User fetch error: %s: %s", error.name, error.message);
      returnResponse(context, outputResponse, error);
    });
};

module.exports = function(context, req) {
  context.log("Processing request for UserID: %d", req.params.userId);
  context.res.status = 500;
  yotiClient
    .getActivityDetails(req.params.token)
    .then(activityDetails => {
      getAllDetails(context, req, activityDetails);
    })
    .catch(function(error) {
      context.error("Yoti decode error: %s: %s", error.name, error.message);
      returnResponse(context, outputResponse, error);
    });
  context.done();
};
