const fetch = require('node-fetch');
const cosmos = require("@azure/cosmos");
import {updateUserService} from "../shared/common.js";

const updateCosmos = function(context, userId, userUpdated, userError, verificationDetails){
    const response = {
        datestamp: new Date().toISOString(),
        userId: userId,
        verified: true,
        verificationDetails: verificationDetails,
        isError: userError ? true: false,
        error: userError,
        userUpdated: userUpdated
    }
    context.bindings.outputDocument = response;
}

module.exports = async function (context, req) {
    context.log('JavaScript HTTP trigger function processed a request.');
    const userId = req.body.userId;
    const verificationDetails = req.body.verificationDetails
    var userError;

    try{
    const userUpdated = await updateUserService(userId, true);
    }
    catch(err){
        userError = err;
    }

    updateCosmos(context, userId, userUpdated, userError, verificationDetails);

    context.res = {
        status: error ? 500 : 200,
        // status: 200, /* Defaults to 200 */
        body: {success: true}
    };
}