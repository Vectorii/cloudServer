const fetch = require("node-fetch");

var response;
var error;

async function process(request) {
    let requestClass = request["class"];
    let requestType = request["type"];
    let requestData = request["data"];

    error = false;
    response = {"error":false,"data":[]};

    try {
        switch (requestClass) {
        case 'user':
            switch(requestType) {
            case 'getJoinTimestamp':
                // request parameters: [username]
                // response values: [timestamp of user join date]
                let username = requestData[0];
                let timestamp;
                
                url = "https://api.scratch.mit.edu/users/"+username;
                apiRequest = await get(url);
                if (!error) {
                    timestamp = apiRequest["history"]["joined"];
                    response["data"].push(timestamp);
                } else {
                    response["error"] = error;
                }
                break;
            default:
                error = true;
                response = {"error":error,"data":[]};
            }
            break;
        default:
            error = true;
            response = {"error":error,"data":[]};
        }
    } catch(err) { 
        error = true;
        response = {"error":error,"data":[]};
    }
    return response;
}

async function get(url) {
    return run(url).catch(function(status) {
        error = true;
    })
    function run(url) {
        return new Promise((resolve, reject) => {
            fetch(url).then(function(response) {
                if (!response.ok) {
                    reject(response.status);
                }
                response.json().then(function(data) {
                    resolve(data);
                })
            })
        })
    }
}

module.exports = { process };