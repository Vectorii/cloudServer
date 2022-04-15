const Fetch = require("node-fetch");

function process(data) {
    let container = data[0];
    let func = data[1];
    data = data.slice(2);
    
    let response = {"status":200,"data":[]};

    try {
        switch (container) {
            case 'user':
                switch(func) {
                    case 'getusername':
                        get("https://api.scratch.mit.edu/users/mres")
                        response["data"].push(data[0]);
                    break;
                }
            break;
        }
    } catch {
        response = {"status":500,"data":[]};
    }
    return response;
}

async function get(url) {
    e = await Fetch(url)
    console.log(e.json())
}
module.exports = { process };