const fetch = require('node-fetch');
const cosmos = require("@azure/cosmos");

const putUserServiceUrl = process.env.PUT_USER_SERVICE_URL;
const userServiceKey = process.env.USER_SERVICE_KEY;

// Database connection //
const endpoint = process.env.COSMOS_API_URL;
const masterKey = process.env.COSMOS_API_KEY;
const { CosmosClient } = cosmos;
const client = new CosmosClient({ endpoint: endpoint, key: masterKey });
const container = client
  .database("verificationDB")
  .container("verification-attempts");

const updateUserService = async function(userId){
    var result = await fetch(putUserServiceUrl, {
        method: "PUT",
        mode: "same-origin",
        headers: {
          "Content-type": "application/json",
          "x-functions-key": userServiceKey,
          "cache-control": "no-cache",
        },
        body: JSON.stringify({
          UserId: verificationAttempt.userId,
          IsVerified: true,
        }),
      });
      if (result.status === 200){
      var resultJSON = await result.json();
      return resultJSON.success; 
      }else if (result.status === 401){
          throw 'User Service Unauthorised: Is key valid?'
      } else {
          throw 'User Service Error'
      }
}

const updateCosmos = function(context, userId, userError, verificationDetails){
    const response = {
        datestamp: new Date().toISOString(),
        userId: userId,
        verified: true,
        verificationDetails: verificationDetails,
        isError: userError
    }
    context.bindings.outputDocument = response;
}

module.exports = async function (context, req) {
    context.log('JavaScript HTTP trigger function processed a request.');
    const userId = req.body.userId;
    const verificationDetails = req.body.verificationDetails
    var userError;

    try{
    const userUpdated = await updateUserService(userId);
    }
    catch(err){
        userError = err;
    }

    updateCosmos(context, userId, userError, verificationDetails);

    context.res = {
        status: error ? 500 : 200,
        // status: 200, /* Defaults to 200 */
        body: {success: true}
    };
}