const puppeteer = require('puppeteer');
const Xvfb      = require('xvfb');
const fs = require('fs');
const os = require('os');
const homedir = os.homedir();
const platform = os.platform();
const { copyToPath, playbackFile, resolutionX, resolutionY, displayChat, bitrate } = require('./env');
const spawn = require('child_process').spawn;
const path_linux_chromium = '/usr/bin/chromium-browser';
const path_linux_chrome = '/usr/bin/google-chrome';
const path_darwin_chrome = '/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome';

var width       = Number(resolutionX);
var height      = Number(resolutionY);
//console.log('width: ' + width + ' height: ' + height);

var xvfb        = new Xvfb({
    silent: true,
    xvfb_args: ["-screen", "0", `${width}x${height}x24`, "-ac", "-nolisten", "tcp", "-dpi", "96", "+extension", "RANDR"]
});
var options     = {
  headless: false,
  args: [
    '--enable-usermedia-screen-capturing',
    '--allow-http-screen-capture',
    '--auto-select-desktop-capture-source=bbbrecorder',
    '--load-extension=' + __dirname,
    '--disable-extensions-except=' + __dirname,
    '--disable-infobars',
    '--no-sandbox',
    '--shm-size=1gb',
    '--disable-dev-shm-usage',
    '--start-fullscreen',
    '-homepage about:blank',
    '--app',
  ],
}

if(platform == "linux"){
//    fs.access(path_linux_chrome, fs.F_OK, (err) => {
//        if (err) {
//            console.error("Chrome not found - trying Chromium");
//            fs.access(path_linux_chromium, fs.F_OK, (err2) => {
//                if (err2) {
//                    console.error("Chromium not found - no supported browser found, exiting");
//                    return
//                }
                options.executablePath = path_linux_chrome;
//            })
//            return
//        }
//    options.executablePath = path_linux_chrome;
//    })
}else if(platform == "darwin"){
    fs.access(path_linux_chrome, fs.F_OK, (err) => {
        if (err) {
            console.error("Chrome not found - no supported browser found, exiting");
            return
        }
    options.executablePath = path_darwin_chrome;
    })
}

async function main() {
    let browser, page;

    try{
        if(platform == "linux"){
            xvfb.startSync()
        }

        var url = process.argv[2];
        if(!url){
            console.warn('URL undefined!');
            process.exit(1);
        }
        // Verify if recording URL has the correct format
        var urlRegex = new RegExp('^https?:\\/\\/.*\\/playback\\/presentation\\/2\\.[03]\\/' + playbackFile + '\\?meetingId=[a-z0-9]{40}-[0-9]{13}');
        if(!urlRegex.test(url)){
            console.warn('Invalid recording URL!');
            process.exit(1);
        }

        var exportname = process.argv[3];
        // Use meeting ID as export name if it isn't defined or if its value is "MEETING_ID"
        if(!exportname || exportname == "MEETING_ID"){
            exportname = url.split("=")[1] + '.webm';
        }

        var duration = process.argv[4];
        // If duration isn't defined, set it in 0
        if(!duration){
            duration = 0;
        // Check if duration is a natural number
        }else if(!Number.isInteger(Number(duration)) || duration < 0){
            console.warn('Duration must be a natural number!');
            process.exit(1);
        }

        browser = await puppeteer.launch(options)
        const pages = await browser.pages()

        page = pages[0]

        page.on('console', msg => {
            var m = msg.text();
            console.log('PAGE LOG:', m) // uncomment if you need
        });

        await page._client.send('Emulation.clearDeviceMetricsOverride')
        // Catch URL unreachable error
        await page.goto(url, {waitUntil: 'networkidle2'}).catch(e => {
            console.error('Recording URL unreachable!');
            process.exit(2);
        })
        await page.setBypassCSP(true)

        // Check if recording exists (search "Recording not found" message)
        var loadMsg = await page.evaluate(() => {
            return document.getElementById("load-msg").textContent;
        });
        if(loadMsg == "Recording not found"){
            console.warn("Recording not found!");
            process.exit(1);
        }

        // Get recording duration
        var recDuration = await page.evaluate(() => {
            return document.getElementById("video").duration;
        });
        // If duration was set to 0 or is greater than recDuration, use recDuration value
        if(duration == 0 || duration > recDuration){
            duration = recDuration;
        }

        await page.waitForSelector('button[class=acorn-play-button]');
        await page.$eval('#navbar', element => element.style.display = "none");
        await page.$eval('#copyright', element => element.style.display = "none");
        await page.$eval('.acorn-controls', element => element.style.opacity = "0");
        await page.click('button[class=acorn-play-button]', {waitUntil: 'domcontentloaded'});

        await page.evaluate((x) => {
            console.log("REC_START");
            window.postMessage({type: 'REC_START'}, '*')
        })

        // Perform any actions that have to be captured in the exported video
        await page.waitFor((duration * 1000))

        await page.evaluate(filename=>{
            window.postMessage({type: 'SET_EXPORT_PATH', filename: filename}, '*')
            window.postMessage({type: 'REC_STOP'}, '*')
        }, exportname)

        // Wait for download of webm to complete
        await page.waitForSelector('html.downloadComplete', {timeout: 0})

        copyOnly(exportname)

    }catch(err) {
        console.log(err)
    } finally {
        page.close && await page.close()
        browser.close && await browser.close()

        if(platform == "linux"){
            xvfb.stopSync()
        }
    }
}

main()

function copyOnly(filename){

    var copyFrom = homedir + "/Downloads/" + filename;
    var copyTo = copyToPath + "/" + filename;

    if(!fs.existsSync(copyToPath)){
        fs.mkdirSync(copyToPath);
    }

    try {

        fs.copyFileSync(copyFrom, copyTo)
        console.log('successfully copied ' + copyTo);

        fs.unlinkSync(copyFrom);
        console.log('successfully delete ' + copyFrom);
    } catch (err) {
        console.log(err)
    }
}
