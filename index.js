const dotenv = require("dotenv")
dotenv.config();
const Scratch = require("scratch-api");
const processRequest = require("./processRequest.js")

const PROJECT_ID = 673158462;  // Project ID to connect to
const IDLE_TIMEOUT = 10000;  // idle after 10 seconds
const ID_LENGTH = 12;
const WAIT_SET_TIME = 1000;  // wait 1s before sending each set of data
const CHARACTERS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456879`-=~!@#$%^&*()_+[]\\{}|;':\",./<>? ";

var status = 1;

var requests = {};
var completeUploadedRequests = [];
var responses = {};
var responsesChunkCount = [];
var responseIDsUnconfirmed = [];
var updatesSent = 0;

var lastSend = 0;


/*Status
1 - IDLE
2 - UPLOAD phase
3 - PROCESSING
4 - DOWNLOAD phase*/

var total = 0;


// create a new usersession with the stored login credentials
Scratch.UserSession.create(process.env.USERNAME, process.env.PASSWORD, (err, user) => {
	if (err) throw err;
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
		lastSend = Date.now();
		
		// cloud variable updates
		Cloud.on('set', async(name, value) => {
			if (name == "☁ UPLOAD") {
				if (status == 1 && value == "1") { // new request ping
					NewUpload();
				} else if (status == 2 && value.charAt(0) == "2") { // user uploading data
					UploadChunk(value);
					if (CheckUploadPhaseEnd()) {
						await DownloadPhase();
					}
				} else if (status == 3 && value.charAt(0) == "3") {
					DownloadReceived(value)
				}
			}
		})

		function NewUpload() {
			UploadPhase();
		}

		function UploadPhase() {
			status = 2;
			if (Date.now() - lastSend > WAIT_SET_TIME) 
				Cloud.set("☁ STATUS", status);
			else setTimeout(function() {
				Cloud.set("☁ STATUS", status);
			}, WAIT_SET_TIME)
			completeUploadedRequests = [];
		}

		function UploadChunk(value) {
			let data = ParseChunk(value);
			console.log("upload",data)

			let requestID = data["requestID"];
			let chunkNum = data["chunkNum"];
			let totalChunks = data["totalChunks"];
			let rawData = data["rawData"];

			if (chunkNum == 1) {
				// create a new request object
				requests[requestID] = {
					'UploadChunksTotal': totalChunks, 
					'UploadedChunks': chunkNum,
					'RawData': rawData, 
					"UploadComplete": false, 
					"DecodedData": [], 
					"DownloadChunksTotal": 0, 
					"DownloadedChunks": 0,
					"EncodedDownloadChunks": [], 
					"Error": false,
					"LastUpdate": Date.now(),
				};
			} else {
				if (requestID in requests && !(requests[requestID]["Error"])) {
					if (chunkNum == requests[requestID]["UploadedChunks"] + 1) {
						requests[requestID]["RawData"] += rawData;
						requests[requestID]["UploadedChunks"] = chunkNum;
						requests[requestID]["LastUpdate"] = Date.now();
					} else {
						// missed a chunk
						requests[requestID]["Error"] = true;
					}
				}
			}
			if (!(requests[requestID]["Error"])) {
				if (chunkNum == requests[requestID]["UploadChunksTotal"]) {
					requests[requestID]["UploadComplete"] = true;
					completeUploadedRequests.push(requestID);
				}
			}
		}

		// separate a upload value into the request ID, chunk number, total chunks (if new request) and encoded data.
		function ParseChunk(value) {
			let requestID, chunkNum, totalChunks, rawData;
			let chunkNumLength = 0, totalChunksLength = -1;

			// get request ID
			requestID = parseInt(value.slice(1,1+ID_LENGTH));
			// get length of chunk number
			chunkNumLength = parseInt(value.charAt(1+ID_LENGTH));
			// get chunk number
			chunkNum = parseInt(value.slice(2+ID_LENGTH,2+ID_LENGTH+chunkNumLength));
			if (chunkNum == 1) { // first chunk also includes the amount of chunks
				// get length of total chunks length
				totalChunksLength = parseInt(value.charAt(2+ID_LENGTH+chunkNumLength));
				// get total chunks
				totalChunks = parseInt(value.slice(3+ID_LENGTH+chunkNumLength,3+ID_LENGTH+chunkNumLength+totalChunksLength));
			}
			// the rest of the variable is data encoded as numbers
			rawData = value.slice(3+ID_LENGTH+chunkNumLength+totalChunksLength)

			let data = { "requestID":requestID, "chunkNum":chunkNum, "totalChunks":totalChunks, "rawData":rawData }
			return data;
		}

		function CheckUploadPhaseEnd() {
			if (completeUploadedRequests.length > 0) {
				return true;
			} else return false;
		}

		async function DownloadPhase() {
			EndUploadPhase();
			await ProcessRequests();
			EncodeResponses();
			CreateChunks();
			console.log("responses",responses)
			if (Date.now()-lastSend > WAIT_SET_TIME/10) SendChunks();
			else setTimeout(SendChunks,lastSend + WAIT_SET_TIME/10 - Date.now());
		}

		function EndUploadPhase() {
			status = 3;
			updatesSent = 0;
			if (Date.now()-lastSend > WAIT_SET_TIME/10) 
				Cloud.set("☁ STATUS", status.toString()+updatesSent.toString());
			else setTimeout(function() {
				Cloud.set("☁ STATUS", status.toString()+updatesSent.toString());
			}, WAIT_SET_TIME/10)
		}

		async function ProcessRequests() {
			let decodedRequests = decodeRequests();
			responses = {}
			for (let i = 0; i < Object.keys(decodedRequests).length; i++) {
				let requestID = Object.keys(decodedRequests)[i];
				responses[requestID] = {
					"ResponseData":[],
					"EncodedData":"",
					"Chunks":[],
					"TotalChunks":0,
					"ChunksSent":0,
					"ChunksReceived":0,
				};
				let responseData = await processRequest.process(decodedRequests[requestID]);
				if (responseData["error"]) responseData["data"].splice(0,0,"error") 
				responses[requestID]["ResponseData"] = responseData["data"];
			}
		}

		function decodeRequests() {
			function decode(RawData) {
				output = [];
				string = "";
				for (i = 0; i < RawData.length/2; i++) {
					encodedChar = parseInt(RawData.slice(i*2,i*2+2)) - 1;
					if (encodedChar == -1) {
						output.push(string);
						string = "";
					} else {
						string += CHARACTERS.charAt(encodedChar);
					}
				}
				return output;
			}
			
			let decodedRequests = {};
			for (i = 0; i < completeUploadedRequests.length; i++) {
				// get request ID from the complete requests list
				requestID = completeUploadedRequests[i];
				// decode request
				decodedRequest = decode(requests[requestID]["RawData"]);
				// parse request into class, type, and data
				parsedDecodedRequest = {"class":decodedRequest[0],"type":decodedRequest[1],"data":decodedRequest.slice(2)}
				requests[requestID]["DecodedData"] = parsedDecodedRequest;
				decodedRequests[requestID] = parsedDecodedRequest;
			}
			console.log("request",decodedRequests);
			return decodedRequests;
		}


		function EncodeResponses() {
			for (let i = 0; i < Object.keys(responses).length; i++) {
				let requestID = Object.keys(responses)[i];
				let responseData = responses[requestID]["ResponseData"];
				responses[requestID]["EncodedData"] = Encode(responseData);
			}
			function Encode(responseData) {
				let encodedResponse = "";
				for (let item = 0; item < responseData.length; item++) {
					for (char = 0; char < responseData[item].toString().length; char++) {
						charValue = (CHARACTERS.indexOf(responseData[item].toString().charAt(char)) + 1).toString();
						if (charValue.length == 1) charValue = "0"+charValue;
						encodedResponse += charValue;
					}
					encodedResponse += "00";
				}
				return encodedResponse;
			}
		}

		function CreateChunks() {
			for (let responseNum = 0; responseNum < Object.keys(responses).length; responseNum++) {
				let requestID = Object.keys(responses)[responseNum];
				let encodedResponse = responses[requestID]["EncodedData"];
				totalDataLength = encodedResponse.length;
				chunkCount = 0;
				while (chunkCount < Math.ceil(totalDataLength/256)) {
					chunkCount = Math.ceil(totalDataLength/256);
					totalDataLength = encodedResponse.length;
					for (let i = 1; i < chunkCount + 1; i++) {
						if (i == 1) chunkHeader = "3" + requestID + i.toString().length + i + chunkCount.toString().length + chunkCount;
						else chunkHeader = "3" + requestID + i.toString().length + i;
						totalDataLength += chunkHeader.length;
					}
				}
				responses[requestID]["TotalChunks"] = chunkCount;
				char = 0;
				for (let i = 1; i < chunkCount + 1; i++) {
					chunkValue = ""
					if (i == 1) chunkHeader = "3" + requestID + i.toString().length + i + chunkCount.toString().length + chunkCount;
					else chunkHeader = "3" + requestID + i.toString().length + i;
					chunkValue += chunkHeader;
					chunkValue += encodedResponse.slice(char,char + (256 - chunkHeader.length));
					responses[requestID]["Chunks"].push(chunkValue);
					char += 256 - chunkHeader.length;
				}

				responsesChunkCount.push({"":""})
			}
		}

		function SendChunks() {
			responseIDsUnconfirmed = [];
			let chunks = [];
			let requestIDRemaining = [];
			let chunksRemaining = [];
			// decide which chunks to send
			// send the smallest response total chunks first
			// maximum 8 chunks at a time
			do {
				requestIDRemaining = [];
				chunksRemaining = [];
				for (let responseNum = 0; responseNum < Object.keys(responses).length; responseNum++) {
					let requestID = Object.keys(responses)[responseNum];
					responseChunksRemaining = responses[requestID]["TotalChunks"] - responses[requestID]["ChunksSent"];
					if (responseChunksRemaining > 0) {
						requestIDRemaining.push(requestID);
						chunksRemaining.push(responseChunksRemaining);
					}
				}
				if (requestIDRemaining.length > 0) {
					let num = chunksRemaining.indexOf(Math.min(chunksRemaining))
					let requestID = requestIDRemaining[num];
					chunks.push(responses[requestID]["Chunks"][responses[requestID]["ChunksSent"]]);
					responses[requestID]["ChunksSent"] += 1;
					if (!(responseIDsUnconfirmed.includes(requestID))) responseIDsUnconfirmed.push(requestID);
				}
			} while (chunks.length < 8 && requestIDRemaining.length != 0);
			// set cloud variables
			for (i = 0; i < chunks.length; i++) {
				Cloud.set("☁ DOWNLOAD" + i, chunks[i]);
			}
			updatesSent += 1;
			Cloud.set("☁ STATUS", status.toString()+updatesSent.toString());
			lastSend = Date.now();
			console.log("send response "+updatesSent)
		}

		function DownloadReceived(value) {
			requestID = value.slice(1,1+ID_LENGTH);
			if (responseIDsUnconfirmed.includes(requestID)) {
				responseIDsUnconfirmed.splice(responseIDsUnconfirmed.indexOf(requestID),1);
				let receivedChunks = responses[requestID]["ChunksSent"];
				responses[requestID]["ChunksReceived"] = receivedChunks;
				if (responses[requestID]["TotalChunks"] == receivedChunks) {
					delete responses[requestID];
					delete requests[requestID];
				}
				// finished sending all chunks
				if (Object.keys(responses).length == 0) {
					console.log("response complete\n\n")
					UploadPhase();
					return;
				}
			}
			if (responseIDsUnconfirmed.length == 0) {
				if (Date.now()-lastSend > WAIT_SET_TIME) SendChunks();
				else setTimeout(SendChunks,lastSend + WAIT_SET_TIME - Date.now());
			}
		}
	})
})



