const fs = require('fs');
const yoti = require("yoti");
const CLIENT_SDK_ID = process.env["yoti_api_key"];
const PEM_PATH = __dirname + "//resources//security.pem";
const PEM_KEY = fs.readFileSync(PEM_PATH);
const yotiClient = new yoti.Client(CLIENT_SDK_ID, PEM_KEY);

const validationAttempt = function(context, yotiResponse, user){
    context.log(yotiResponse);
    context.log("ValAttempt:" + user);
    const yotiDate = new Date(yotiResponse.dob);
    var userMonth;
    var userYear;
    var userDay;
    var userDate;
    if (user.dob.includes("/")){
      userDay = user.dob.split("/")[0];
      userMonth = user.dob.split("/")[1] - 1;
      userYear = user.dob.split("/")[2];
      userDate = new Date(userYear, userMonth, userDay);
    } else if (user.dob.includes(".")){
      userDay = user.dob.split(".")[0];
      userMonth = user.dob.split(".")[1] - 1;
      userYear = user.dob.split(".")[2];
      userDate = new Date(userYear, userMonth, userDay);
    } else {
      userDate = new Date(user.dob);
    }
    context.log("User Dob Entered: " + user.dob + " Calculated Dob: " + userDate)
    context.log("Yoti Dob:" + yotiResponse.dob + " Calculated Dob: " + yotiDate)
    
    const outcome = {fullname: yotiResponse.name, 
    verified: {date: (userDate.toString() === yotiDate.toString())}};

    context.bindings.outputDocument = outcome;
    context.log("Outcome: ");
    context.res = {
    status: 200, /* Defaults to 200 */
    body: outcome,
    headers: {
        'Content-Type': 'application/json'
    }
    };
    context.done();
  };
const getYotiDetails = function (context,req,activityDetails){

    const submittedDob = req.userID;
    context.log(submittedDob);
    const user = {dob: submittedDob, postCode: submittedPostCode};
    if (activityDetails){
            const rememberMeId = activityDetails.getRememberMeId();
    
            const profile = activityDetails.getProfile();
            const dob = profile.getDateOfBirth().getValue();
            const fullName = profile.getFullName().getValue();
            const yotiResponse = {name: fullName, dob: dob, rememberMeId: rememberMeId}
            validationAttempt(context, yotiResponse, user);
            }else{
              throw new Error("Profile doesn't exist")
            }

}

module.exports = function (context, req) {
    context.log('JavaScript HTTP trigger function processed a request.');
    context.log(CLIENT_SDK_ID);
    context.log(PEM_KEY);
    context.log(req.query.token);
    yotiClient.getActivityDetails(req.token).then((activityDetails)=>{getYotiDetails(context,req,activityDetails)});    
}