const putUserServiceUrl = process.env.PUT_USER_SERVICE_URL;
const userServiceKey = process.env.USER_SERVICE_KEY;

exports.updateUserService =  async function (userId, isVerified){
    var result = await fetch(putUserServiceUrl, {
        method: "PUT",
        mode: "same-origin",
        headers: {
          "Content-type": "application/json",
          "x-functions-key": userServiceKey,
          "cache-control": "no-cache",
        },
        body: JSON.stringify({
          UserId: userId,
          IsVerified: isVerified,
        }),
      });
      var json = await response.json;
      if (json.hasContent === true && json.isSuccessful === true){
        return json.content.success;
      }
      else if (response.status === 401) {
          throw 'User Service Put Unauthorised: Is key valid? ' + userServiceKey
      } else {
          throw 'User Service Error'
      }
}
