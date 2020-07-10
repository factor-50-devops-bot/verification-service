const putUserServiceUrl = process.env.PUT_USER_SERVICE_URL;
const userServiceKey = process.env.USER_SERVICE_KEY;

export async function updateUserService(userId, isVerified){
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
      if (result.status === 200){
      var resultJSON = await result.json();
      return resultJSON.success; 
      }else if (result.status === 401){
          throw 'User Service Unauthorised: Is key valid?'
      } else {
          throw 'User Service Error'
      }
}