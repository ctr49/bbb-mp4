/* global chrome, MediaRecorder, FileReader */

let recorder = null;
let filename = null;
let ws;
let liveSteam = false;
let ffmpegServer;
let doDownload = true;

let width = window.screen.availWidth;
let height = window.screen.availHeight;
//let bitrate = Number(window.screen.availWidth) * Number(window.screen.availHeight) * 3 ;
let bitrate = 2500000;

chrome.runtime.onConnect.addListener(port => {

    port.onMessage.addListener(msg => {
        console.log(msg);
        switch (msg.type) {

            case 'SET_EXPORT_PATH':
                filename = msg.filename
                break

            case 'FFMPEG_SERVER':
                ffmpegServer = msg.ffmpegServer
                startWebsock();
                break

            case 'REC_STOP':
                doDownload = true;
                recorder.stop()
                break

            case 'REC_START':
                if (liveSteam) {
                    recorder.start(1000);
                } else {
                    recorder.start();
                }
                break

            case 'REC_CLIENT_PLAY':
                if (recorder) {
                    return
                }
                const tab = port.sender.tab
                tab.url = msg.data.url
                chrome.desktopCapture.chooseDesktopMedia(['tab', 'audio'], streamId => {
                    let width = window.screen.availWidth;
                    let height = window.screen.availHeight;
                    let bitrate = Number(window.screen.availWidth) * Number(window.screen.availHeight) * 3 ;
                    // Get the stream
                    navigator.webkitGetUserMedia({
                        audio: {
                            mandatory: {
                                chromeMediaSource: 'system'
                            }
                        },
                        video: {
                            mandatory: {
                                chromeMediaSource: 'desktop',
                                chromeMediaSourceId: streamId,
                                minWidth: width,
                                maxWidth: width,
                                minHeight: height,
                                maxHeight: height,
                                minFrameRate: 60,
                            }
                        }
                    }, stream => {
                        var chunks = [];
			var options;
			var buffer_type;
			var codec_preferences = ['video/mp4; codecs="avc1.4D401E, mp4a.40.2"',
                                                 'video/webm; codecs="h264,aac"',
                                                 'video/webm; codecs=h264',
                                                 'video/webm; codecs=vp9',
                                                 'video/webm; codecs=vp8'];
			try {
			    for (var i in codec_preferences) {
                                console.log( "Is " + types[i] + " supported? " + (MediaRecorder.isTypeSupported(types[i]) ? "Maybe!" : "Nope :("));
                        }
                        catch (e) {
                            console.log("ERRROR - " + e);
                        }
                        //if (MediaRecorder.isTypeSupported('video/mp4; codecs="avc1.4D401E, mp4a.40.2"')) {
                        //    options = {mimeType: 'video/mp4; codecs="avc1.4D401E, mp4a.40.2"', ignoreMutedMedia: true, videoBitsPerSecond: bitrate };
                        //    buffer_type = 'video/mp4';
                        //} else if (MediaRecorder.isTypeSupported('video/webm; codecs="h264,aac"')) {
                        //    options = {mimeType: 'video/webm; codecs=h264,aac', ignoreMutedMedia: true, videoBitsPerSecond: bitrate };
                        //    buffer_type = 'video/webm';
                        //} else if (MediaRecorder.isTypeSupported('video/webm; codecs=h264')) {
                        //    options = {mimeType: 'video/webm; codecs=h264', ignoreMutedMedia: true, videoBitsPerSecond: bitrate };
                        //    buffer_type = 'video/webm';
                        //} else if (MediaRecorder.isTypeSupported('video/webm; codecs=vp9')) {
                        //    options = {mimeType: 'video/webm; codecs=vp9', ignoreMutedMedia: true, videoBitsPerSecond: bitrate };
                        //    buffer_type = 'video/webm';
                        //} else (MediaRecorder.isTypeSupported('video/webm; codecs=vp8')) {
                        //    options = {mimeType: 'video/webm; codecs=vp8', ignoreMutedMedia: true, videoBitsPerSecond: bitrate };
                        //    buffer_type = 'video/webm';
                        //}
			options = {
                            videoBitsPerSecond: 2500000,
                            ignoreMutedMedia: true,
                            mimeType: 'video/webm;codecs=h264'
                        };
                        recorder = new MediaRecorder(stream, options);
                        recorder.ondataavailable = function (event) {
                            if (event.data.size > 0) {
                                chunks.push(event.data);
                                if (liveSteam) {
                                    ws.send(event.data);
                                }
                            }
                        };

                        recorder.onstop = function () {
                            if (liveSteam) {
                                ws.close();
                            }

                            if(!doDownload){
                                chunks = [];
                                return;
                            }

                            var superBuffer = new Blob(chunks, {
                                type: buffer_type
                            });

                            var url = URL.createObjectURL(superBuffer);

                            chrome.downloads.download({
                                url: url,
                                filename: filename
                            }, () => {
                            });
                        }

                    }, error => console.log('Unable to get user media', error))
                })
                break
            default:
                console.log('Unrecognized message', msg)
        }
    })

    chrome.downloads.onChanged.addListener(function (delta) {
        if (!delta.state || (delta.state.current != 'complete')) {
            return;
        }
        try {
            port.postMessage({ downloadComplete: true })
        }
        catch (e) { }
    });

})

function startWebsock() {

    ws = new WebSocket(ffmpegServer);
    liveSteam = true;

    ws.onmessage = function (e) {
        console.log(e.data);

        if (e.data == "ffmpegClosed") {
            
            doDownload = false;
            recorder.stop();

            setTimeout(function () {
                startWebsock();
                recorder.start(1000);
            }, 500)
        }
    }
}
