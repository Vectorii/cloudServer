const dotenv = require("dotenv");
//const Scratch = require('./scratchapi.js');
const Scratch = require("scratch-api");
const PROJECT_ID = 673158462;  // Project ID to connect to
const IDLE_TIMEOUT = 10000;  // idle after 10 seconds
const ID_LENGTH = 12;

var requests = {};
var status = 1;

/*Status
1 - IDLE
2 - UPLOAD phase
3 - PROCESSING
4 - DOWNLOAD phase*/

var total = 0;


// create a new usersession with the stored login credentials
Scratch.UserSession.create(process.env.USERNAME, process.env.PASSWORD, (err, user) => {
	if (err) {
    throw (err);
  }
	// start a cloud session with the Project ID
	user.cloudSession(PROJECT_ID, (err, Cloud) => {
		if (err) throw err;
		else console.log("connected")
		// reset cloud variables
		Cloud.set("☁ UPLOAD", "");
		for (i = 0; i < 8; i++) {
			Cloud.set("☁ DOWNLOAD"+i, "");
		}
		Cloud.set("☁ STATUS", status);
		
		// cloud variable updates
		Cloud.on('set', async (name, value) => {
			if (name == "☁ UPLOAD") {
				// clear timeout
				if (typeof timeoutID !== "undefined") {
					clearTimeout(timeoutID);
				}
				if (status == 1 && value == "1") { // new request ping
					status = 2;
					Cloud.set("☁ STATUS", status);
					
				} else if (value.slice(0,1) == "2") { // user uploading data
					// get request ID
					char = 1;
					var requestID = parseInt(value.slice(char,char+ID_LENGTH));
					char += ID_LENGTH;
					var chunkNumLength = parseInt(value.charAt(char));
					char += 1;
					// get chunk number
					var chunkNum = parseInt(value.slice(char,char+chunkNumLength));
					char += chunkNumLength;
					// check if new request
					if (chunkNum == 1 && !(requestID in requests)) {
						if (status == 2) { // only allow new requests if upload phase
							totalChunksLength = parseInt(value.charAt(char));
							char += 1;
							// get total chunks
							totalChunks = parseInt(value.slice(char,char+totalChunksLength));
							char += totalChunksLength;
							// data of request
							data = value.slice(char);
							// set requestID object and store in the requests object
							requests[requestID] = {'UploadChunksTotal': totalChunks, 'UploadedChunks': chunkNum,
											    	'RawData': data, "UploadComplete": false, "DecodedData": [], 
											    	"DownloadChunksTotal": 0, "DownloadedChunks": 0,
											    	"EncodedDownloadChunks": [], "Error": false,
													"LastUpdate": Date.now(),
												  };
						}
					} else {
						// not new request
						if (requestID in requests && requests[requestID]["Error"] == false) {
							if (chunkNum == 1) {
								requests[requestID]["Error"] = true;
							} else {
								if (chunkNum == requests[requestID]["UploadedChunks"] + 1) {
									data = value.slice(char);
									requests[requestID]["RawData"] += data;
									requests[requestID]["UploadedChunks"] = chunkNum;
									requests[requestID]["LastUpdate"] = Date.now();
									if (chunkNum = requests[requestID]["UploadChunksTotal"]) {
										requests[requestID]["UploadComplete"] = true;
									}
									if (requests[requestID]["UploadComplete"] == true) {
										status = 3;
										Cloud.set("☁ STATUS", status);
									}
								} else {
									// missed a chunk
									requests[requestID]["Error"] = true;
								}
							}
						}
					}
				}
				
				// set timeout for inactivity
				timeoutID = setTimeout(Idle,IDLE_TIMEOUT);

				function Idle() {
					// set status to idle
					status = 1;
					Cloud.set("☁ STATUS", status);
				}
			}
		})
	})
})