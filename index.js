const dotenv = require("dotenv");
dotenv.config();
//const Scratch = require('./scratchapi.js');
const Scratch = require("scratch-api");
const PROJECT_ID = 673158462;  // Project ID to connect to
const IDLE_TIMEOUT = 10000;  // idle after 10 seconds
const ID_LENGTH = 12;

let requests = {};
let completeUploadedRequests = [];
let downloadResponsesRemaining = [];
let status = 1;
let updatesSent = 0;


/*Status
1 - IDLE
2 - UPLOAD phase
3 - PROCESSING
4 - DOWNLOAD phase*/

let total = 0;


function run() {
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
			Cloud.on('set', (name, value) => {
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
						let requestID = parseInt(value.slice(char,char+ID_LENGTH));
						char += ID_LENGTH;
						let chunkNumLength = parseInt(value.charAt(char));
						char += 1;
						// get chunk number
						let chunkNum = parseInt(value.slice(char,char+chunkNumLength));
						char += chunkNumLength;
						// check if new request
						if (chunkNum == 1 && !(requestID in requests)) {
							if (status == 2) { // only allow new requests if upload phase
								let totalChunksLength = parseInt(value.charAt(char));
								char += 1;
								// get total chunks
								let totalChunks = parseInt(value.slice(char,char+totalChunksLength));
								char += totalChunksLength;
								// data of request
								let data = value.slice(char);
								// set requestID object and store in the requests object
								requests[requestID] = {'UploadChunksTotal': totalChunks, 'UploadedChunks': chunkNum,
														'RawData': data, "UploadComplete": false, "DecodedData": [], 
														"DownloadChunksTotal": 0, "DownloadedChunks": 0,
														"EncodedDownloadChunks": [], "Error": false,
														"LastUpdate": Date.now(),
													};
								if (chunkNum == requests[requestID]["UploadChunksTotal"]) {
									requests[requestID]["UploadComplete"] = true;
									completeUploadedRequests.push(requestID);
								}
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
										if (chunkNum == requests[requestID]["UploadChunksTotal"]) {
											requests[requestID]["UploadComplete"] = true;
											completeUploadedRequests.push(requestID);
										}
									} else {
										// missed a chunk
										requests[requestID]["Error"] = true;
									}
								}
							}
						}
						if (checkUploadPhaseEnd()) {
							endUploadPhase();
							decodeUploadedRequests();
							requests = {};
							completeUploadedRequests = [];
							status = 2;
							Cloud.set("☁ STATUS", status);
						}

					}
					//console.log(chunkNum,value);
					
					// set timeout for inactivity
					timeoutID = setTimeout(Idle,IDLE_TIMEOUT);

					function Idle() {
						// set status to idle
						status = 1;
						Cloud.set("☁ STATUS", status);
					}
				}
			})

			function checkUploadPhaseEnd() {
				if (completeUploadedRequests.length > 0) {
					return true;
				} else {
					return false;
				}
			}

			function endUploadPhase() {
				status = 3;
				updatesSent = 0;
				Cloud.set("☁ STATUS", status.toString()+updatesSent.toString());
			}

			function decodeUploadedRequests() {
				function decode(RawData) {
					const characters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456879`-=~!@#$%^&*()_+[]\\{}|;':\",./<>? ";
					output = [];
					string = "";
					for (i = 0; i < RawData.length/2; i++) {
						encodedChar = parseInt(RawData.slice(i*2,i*2+2)) - 1;
						if (encodedChar == -1) {
							output.push(string);
							string = "";
						} else {
							string += characters.charAt(encodedChar);
						}
					}
					return output;
				}
				
				decodedRequests = {};
				for (i = 0; i < completeUploadedRequests.length; i++) {
					requestID = completeUploadedRequests[i];
					decodedRequest = decode(requests[requestID]["RawData"]);
					requests[requestID]["DecodedData"] = decodedRequest;
					decodedRequests[requestID] = decodedRequest;
				}
				console.log(decodedRequests);
				return decodedRequests;
			}
		})
	})
}




run(); 