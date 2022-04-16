const fetch = require("node-fetch");

var response;
var error;

async function process(request) {
    let requestClass = request["class"];
    let requestFunction = request["function"];
    let requestData = request["data"];

    response = {"status":200,"data":[]};
    error = false;

    try {
        switch (requestClass) {
        case 'user':
            switch(requestFunction) {
            case 'getJoinTimestamp':
                // request parameters: [username]
                // response values: [timestamp of user join date]
                let username = requestData[0];;
                let timestamp;
                
                url = "https://api.scratch.mit.edu/users/"+username;
                apiRequest = await get(url);
                if (!error) {
                    timestamp = apiRequest["history"]["joined"];
                    response["data"].push(timestamp);
                }
                break;
            default:
                response = {"status":400,"data":[]};
            }
            break;
        default:
            response = {"status":400,"data":[]};
        }
    } catch(err) { 
        console.log(err);
        response = {"status":500,"data":[]};
    }

    return response;
}

async function get(url) {
    return run().catch(function(status) {
        response = {"status":status,"data":[]};
        error = true;
    })
    function run() {
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