// Requires //
const yoti = require("yoti");
const cosmos = require("@azure/cosmos");
const fetch = require("node-fetch");
const common = require('../shared/common.js')

// Yoti connection //
const CLIENT_SDK_ID = process.env["yoti_api_key"];
const PEM_KEY = process.env["yoti-pem"].replace(/\\n/gm, "\n");
const yotiClient = new yoti.Client(CLIENT_SDK_ID, PEM_KEY);

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
const numberOfYotis = process.env["yoti-number-of-attempts"]; // Number of allowable Yotis

// Debug Settings //
const respondWithError = true;
const errorCosmos = true;
const disablePreviousAuthCheck =
  process.env["yoti-previous-auth"] === "true" ? true : false;

const compareAge = function (age1, age2) {
  return (
    age1.getDate() === age2.getDate() &&
    age1.getMonth() === age2.getMonth() &&
    age1.getFullYear() === age2.getFullYear()
  );
};

const isOldEnough = function (dateOfBirth, ageLimit) {
  const dateOfAcceptability = new Date(
    dateOfBirth.getFullYear() + ageLimit,
    dateOfBirth.getMonth(),
    dateOfBirth.getDate()
  );
  const today = new Date();
  return today >= dateOfAcceptability;
};

const getPreviousVerifications = function (rememberMeId, userId) {
  var query =
    `SELECT * FROM c WHERE c.rememberMeId = '${rememberMeId}'` +
    ` AND c.verified = true` +
    ` AND c.userID != ${userId}`;

  return container.items.query(query).fetchAll();
};

const verify = async function (yotiResponse, user) {
  var userDob = new Date(user.userPersonalDetails.dateOfBirth);
  var yotiDob = new Date(yotiResponse.dob);
  var previousVerifications = await getPreviousVerifications(
    yotiResponse.rememberMeId, user.id
  );

  var dobMatch = compareAge(userDob, yotiDob); // Check yoti has given us a user with matching dob
  var ageMatch = isOldEnough(userDob, ageLimit); // Check user is old enough
  var notPreviouslyVerified = previousVerifications.resources.length < numberOfYotis; // Check yotiId not used for too many successful verifications before

  var verified =
    dobMatch && ageMatch && (notPreviouslyVerified || disablePreviousAuthCheck);

  return {
    datestamp: new Date().toISOString(),
    userId: user.id,
    rememberMeId: yotiResponse.rememberMeId,
    verified: verified,
    verificationDetails: {
      verificationMethod: "Yoti",
      dobMatch: dobMatch,
      ageMatch: ageMatch,
      notPreviouslyVerified: notPreviouslyVerified,
    },
    isError: false
  };
};

const returnResponse = function (context, response, responseError) {
  // Generate HTTP response
  var statusCode;
  if (responseError) {
    statusCode = 500;
  } else {
    statusCode = response.verified ? 200 : 401;
  }

  var responseBody;
  if (responseError) {
    responseBody = respondWithError ? responseError : null;
  } else {
    responseBody = response;
  }

  context.res = {
    status: statusCode,
    body: responseBody,
    headers: {
      "Content-Type": "application/json",
    },
  };
};

const getYotiDetails = function (activityDetails) {
  if (activityDetails) {
    const rememberMeId = activityDetails.getRememberMeId();
    const profile = activityDetails.getProfile();
    const dob = profile.getDateOfBirth().getValue();
    const fullName = profile.getFullName().getValue();
    return { name: fullName, dob: dob, rememberMeId: rememberMeId };
  } else {
    throw 'No activity details in yoti response';
  }
};

const getYoti = function (token) {
  return yotiClient.getActivityDetails(token);
};

const getUser = async function (userId) {
  var response = await fetch(getUserServiceUrl + "?ID=" + userId, {
    method: "get",
    headers: {
      "content-type": "application/json",
      "x-functions-key": userServiceKey,
    },
  });
  if (response.status === 200){
    var json = await response.json();
    if (json.hasContent && json.isSuccessful)
    {
    return json.content;
    } else {
    throw 'User Service JSON unsuccessful'
    }
  }
  else if (response.status === 401) {
    throw 'User Service Unauthorised: Is key valid?'
  } else {
    throw 'User Service error'
  }
};

const processDetails = function (yoti, user) {
  const yotiResponse = getYotiDetails(yoti);
  const userResponse = user.user;
  return { yoti: yotiResponse, user: userResponse };
};

const completeVerification = function (context, response, responseError) {
  // Save to Cosmos
  if (responseError) {
    context.bindings.outputDocument = {
      datestamp: new Date().toISOString(),
      isError: true,
      error: errorCosmos ? responseError : "An error occurred, but security settings prevented database logging",
    };
  } else {
    context.bindings.outputDocument = response;
  }

  // Respond to client
  returnResponse(context, response, responseError);

  // Context Finishes
  context.done();
};

module.exports = function (context, req) {
  
  const yotiPromise = getYoti(req.params.token);
  const userPromise = getUser(req.params.userId);
  var logOutput = "";
  Promise.all([yotiPromise, userPromise])
    .then((values) => {
      logOutput = "Post-Values" ;
      context.log(logOutput);
      return processDetails(values[0], values[1]);
    })
    .then((details) => {
      logOutput = "Post-Details ";
      context.log(logOutput);
      return verify(details.yoti, details.user);
    })
    .then(async (data) => {
      logOutput = "Post-verification ";
      context.log(logOutput);
      var response =  await common.updateUserService(data.userId, data.verified);
    //})
    //.then((response) => {
      data.userUpdated = response;
      data.verified = data.verified && response;
      logOutput = "Post-User Update ";
      context.log(logOutput);
      return completeVerification(context, data);
    })
    .catch((error) => {
      context.log("Error: " + error + " After " + logOutput);
      completeVerification(context, null, {responseText: logOutput, errorData: error});
    });
};
