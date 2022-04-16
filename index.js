const dotenv = require("dotenv")
dotenv.config();
const Scratch = require("scratch-api");
const processRequest = require("./processRequest.js")

const PROJECT_ID = 673158462;  // Project ID to connect to
const IDLE_TIMEOUT = 10000;  // idle after 10 seconds
const ID_LENGTH = 12;

const CHARACTERS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456879`-=~!@#$%^&*()_+[]\\{}|;':\",./<>? ";

var requests = {};
var responses = {};
var completeUploadedRequests = [];
var downloadResponsesRemaining = [];
var status = 1;
var updatesSent = 0;


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
		
		// cloud variable updates
		Cloud.on('set', async(name, value) => {
			if (name == "☁ UPLOAD") {
				if (status == 1 && value == "1") { // new request ping
					NewUpload();
				} else if (status == 2 && value.charAt(0) == "2") { // user uploading data
					UploadChunk(value);
					if (CheckUploadPhaseEnd()) {
						EndUploadPhase();
						ProcessRequests();
					}
				}
			}
		})

		function NewUpload() {
			status = 2;
			Cloud.set("☁ STATUS", status);
		}

		function UploadChunk(value) {
			let data = ParseChunk(value);
			console.log(data)

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
			} else {
				return false;
			}
		}

		function EndUploadPhase() {
			status = 3;
			updatesSent = 0;
			Cloud.set("☁ STATUS", status.toString()+updatesSent.toString());
		}

		async function ProcessRequests() {
			let decodedRequests = decodeUploadedRequests();
			responses = {}
			for (let i = 0; i < Object.keys(decodedRequests).length; i++) {
				let requestID = Object.keys(decodedRequests)[i];
				let response = await processRequest.process(decodedRequests[requestID]);
				let responseData = response["data"];
				responseData.splice(0, 0, response["status"]);
				console.log(responseData);
				encodeResponse(responseData);
			}
		}

		function decodeUploadedRequests() {
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
			
			decodedRequests = {};
			for (i = 0; i < completeUploadedRequests.length; i++) {
				// get request ID from the complete requests list
				requestID = completeUploadedRequests[i];
				// decode request
				decodedRequest = decode(requests[requestID]["RawData"]);
				// parse request into class, function, and values
				parsedDecodedRequest = {"class":decodedRequest[0],"function":decodedRequest[1],"data":decodedRequest.slice(2)}
				requests[requestID]["DecodedData"] = parsedDecodedRequest;
				decodedRequests[requestID] = parsedDecodedRequest;
			}
			console.log(decodedRequests);
			return decodedRequests;
		}

		function encodeResponse(responseData) {
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
	})
})



