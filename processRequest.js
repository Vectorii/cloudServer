const fetch = require("node-fetch");

async function process(request) {
    let requestClass = request["class"];
    let requestFunction = request["function"];
    let requestData = request["data"];
    let error = false;

    let response = {"status":200,"data":[]};

    try {
        switch (requestClass) {
            case 'user':
                switch(requestFunction) {
                    case 'getJoinTimestamp':
                        // request parameters: [username]
                        // response values: [join date timestamp]
                        let username;
                        let timestamp;

                        username = requestData[0];
                        
                        url = "https://api.scratch.mit.edu/users/"+username;
                        apiRequest = await get(url).catch(function(status) {
                            response = {"status":status,"data":[]};
                            error = true;
                        });
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


module.exports = { process };