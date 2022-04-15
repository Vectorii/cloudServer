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

module.exports = { process };