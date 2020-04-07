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
const userServiceUrl = process.env.USER_SERVICE_URL;

// HelpMyStreet Constants//
const ageLimit = 18; //current cutOff for age

const getValidationData = function (context, yotiResponse, user) {
    var dobMatch = (user.dob === yotiResponse.dob); // Check yoti has given us a user with matching dob
    var ageMatch = getUserAgeIsAcceptable(user.dob, ageLimit); // Check user is old enough
    getRMIdNotAlreadyVerified(yotiResponse) // Check yotiId never used for successful validation before
        .then(userNotAlreadyVerified => {
            var verified = (dobMatch && ageMatch && userNotAlreadyVerified);
            processValidation(user, context, yotiResponse, verified);
        }).catch(err => {context.log("error in getting cosmos data")});
}

const processValidation = function (user, context, yotiResponse, verified) {
    const outputResponse = { timestamp: Date(), userId: user.userId, rememberMeId: user.rememberMeId, verified: verified, payload: yotiResponse };

    // Save audit record
    context.bindings.outputDocument = outputResponse;
    // Notify user service
    updateUserModule(user.userId, context, verified);
}

const updateUserModule = function (userId, context, verified) {
    fetch(userServiceUrl + "/setValidation/", {
        method: 'post',
        headers: {
            "Content-type": "application/json"
        },
        body: { userId: userId, verified: verified } // Note updates verified status to true or false, null status indicates never attempted validation
    })
        .then(() => {
             returnResponse(context, {userId: userId, verified: verified})
        })
        .catch(function (error) {
            console.log('User Module error: ', error);
            returnResponse(context, outputResponse, error);
        });
}

const returnResponse = function (context, response, responseError){
        // Generate HTTP response
    var statusCode;
    if (responseError) {
        statusCode = 500;
    } else {
        statusCode = response.verified ? 200 : 401
    }
    context.res = {
        status: statusCode,
        body: {message: "VerService Complete"},
        headers: {
            'Content-Type': 'application/json'
        }
    };
    context.done();
}

const getUserAgeIsAcceptable = function (dob, ageLimit) {
    const dateOfBirth = new Date(dob);
    const dateOfAcceptability = new Date(dateOfBirth.getFullYear() + ageLimit, dateOfBirth.getMonth(), dateOfBirth.getDate());
    const today = new Date();
    return (today >= dateOfAcceptability);
}

const getRMIdNotAlreadyVerified = async function (yotiResponse) {
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

    return (results.length < 1);
}

const getYotiDetails = function (activityDetails) {

    if (activityDetails) {
        const rememberMeId = activityDetails.getRememberMeId();
        const profile = activityDetails.getProfile();
        const dob = profile.getDateOfBirth().getValue();
        const fullName = profile.getFullName().getValue();
        return { name: fullName, dob: dob, rememberMeId: rememberMeId }
    }
}

const getAllDetails = function (context, req, activityDetails) {

    const yotiResponse = getYotiDetails(activityDetails);
    const user = fetch(userServiceUrl + "/getUserById?userId=" + req.userId)
        .then(response => response.json()
            .then(user = getValidationData(context, yotiResponse, user)))
        .catch(err => context.log("User fetch error:" + err));
}

module.exports = function (context, req) {
    yotiClient.getActivityDetails(req.token).then((activityDetails) => { getAllDetails(context, req, activityDetails) });
}