// Requires //
const fs = require('fs');
const yoti = require("yoti");
const cosmos = require('@azure/cosmos');

// Yoti connection //
const CLIENT_SDK_ID = process.env["yoti_api_key"];
const PEM_PATH = __dirname + "//resources//security.pem";
const PEM_KEY = fs.readFileSync(PEM_PATH);
const yotiClient = new yoti.Client(CLIENT_SDK_ID, PEM_KEY);

// Database connection //
const endpoint = process.env.COSMOS_API_URL;
const masterKey = process.env.COSMOS_API_KEY;
const { CosmosClient } = cosmos;
const client = new CosmosClient({ endpoint, auth: { masterKey } });
const container = client.database("verificationDB").container("verification-attempts");

// Other module connections //
const userServiceUrl = "" //Assumes in the form module/api/function/userId:

// HelpMyStreet Constants//
const ageLimit = 18; //current cutOff for age

const doValidation = function (context, yotiResponse, user){
  var dobMatch = (user.dob === yotiResponse.dob); // Check yoti has given us a user with matching dob
  var ageMatch = getAge(user.dob, ageLimit); // Check user is old enough
  var userNotAlreadyVerified = getValidationsForRMId(yotiResponse).catch(err => context.log("error in getting cosmos data")); // Check yotiId never used for successful validation before
  
  if (dobMatch && ageMatch && userNotAlreadyVerified){
    var verified = true;
  } else {
    var verified = false;
  }
  
  // Save audit record
  context.bindings.outputDocument = {timestamp: Date(), userId: user.userId, rememberMeId: user.rememberMeId, verified: verified, payload: yotiResponse}
  // Notify user service
  updateUserModule(user.userId,context,verified);

}

const updateUserModule = function (userId, context,verified){
  fetch(userServiceUrl + "/setValidation/", {
    method: 'post',
    headers: {
      "Content-type": "application/json"
    },
    body: {userId: userId, verified: verified} // Note updates verified status to true or false, null status indicates never attempted validation
  })
  .then(context.done())
  .catch(function (error) {
    console.log('User Module error: ', error);
  });
}

const getAge = function (dob, ageLimit){
  const dateOfBirth = new Date(dob);
  const today = new Date();
  const objDob = {day: dateOfBirth.getDate(), month: dateOfBirth.getMonth(), year: dateOfBirth.getFullYear()};
  const objToday = {day: today.getDate(), month: day.getMonth(), year: dateOfBirth.getFullYear()};
  if (objToday.year - objDob.year > ageLimit ){
    return true;
  } else if ((objToday.year - objDob.year == ageLimit) && ((objToday.month > objDob.month)||((objToday.month == objDob.month) && (objToday.day >= objDob.day)))){
    return true;
  } else {
    return false;
  }
}

const  getValidationsForRMId = async function (yotiResponse){
  const querySpec = {
    query: "SELECT * FROM c WHERE c.rememberMeId = @rmid AND verified = true",
    parameters: [
      {
        name: "@rmid",
        value: yotiResponse.rememberMeId
      }
    ]
  };

  const { result: results } = await container.items.query(querySpec).toArray();
  
  if (results.length > 0){
    return false;
  } else {
    return true;
  }
}

const getYotiDetails = function (activityDetails){
  
  if (activityDetails){
    const rememberMeId = activityDetails.getRememberMeId();
    const profile = activityDetails.getProfile();
    const dob = profile.getDateOfBirth().getValue();
    const fullName = profile.getFullName().getValue();
    return {name: fullName, dob: dob, rememberMeId: rememberMeId}
  }
}

const getAllDetails = function (context, req, activityDetails){
  const yotiResponse = getYotiDetails(activityDetails);
  const user = fetch(userServiceUrl+"/getUserById/"+req.userId)
        .then(response => response.json()
        .then(user => doValidation(context,yotiResponse,user)))
        .catch(err => context.log("User fetch error:" + err));
}

module.exports = function (context, req) {
    yotiClient.getActivityDetails(req.token).then((activityDetails)=>{getAllDetails(context,req,activityDetails)});    
}