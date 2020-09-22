const { execSync } = require('child_process');
const axios = require('axios');
const screenshot = require('screenshot-desktop');
const sharp = require('sharp');

const server = 'http://192.168.1.109:8090';
const endpoint = `${server}/json-rpc`;

const priority = 180;
const DEBUG = true;

const lockInterval = 10;

let lockCounter = 0;
let lockWait = -1;

setInterval(() => {
  try {
    if (lockWait > 0) {
      lockWait--;
      if (DEBUG) console.log('screen disconnected / locked, skipping cycle');
      return;
    }

    const start = Date.now();

    lockCounter++;
    // Throttle these since they seem to cause some cpu spiking, checking lock wait is a bit of a hack but counting is hard so meh
    if (lockCounter > lockInterval || lockWait === 0) {
      lockCounter = 0;
      lockWait = -1;

      // Only update when actual display is on + screen is not locked
      const display = execSync('system_profiler SPDisplaysDataType | grep Resolution');
      const locked = execSync('python -c "import sys,Quartz; d=Quartz.CGSessionCopyCurrentDictionary(); print d"');

      const displayOff = display.toString().indexOf('2560 x 1440') === -1;
      const isLocked = locked.toString().indexOf('CGSSessionScreenIsLocked = 1;') !== -1;
      if (displayOff || isLocked) {
        if (DEBUG && displayOff) console.log('Display off, clearing effect');
        if (DEBUG && isLocked) console.log('Computer is locked, clearing effect');

        lockWait = lockInterval;

        const data = {
          command: 'clear',
          priority,
        };

        axios.post(endpoint, data).catch((err) => console.error(err));

        return;
      }
    }

    const statusCheckTime = Date.now();
    if (DEBUG) console.log('status checks', statusCheckTime - start);

    screenshot()
      .then((img) => {
        const screenshotTime = Date.now();
        if (DEBUG) console.log('screenshot', screenshotTime - statusCheckTime);
        sharp(img)
          .resize(80)
          .toBuffer()
          .then((resized) => {
            const resizeTime = Date.now();
            if (DEBUG) console.log('resize', resizeTime - screenshotTime);
            const data = {
              command: 'image',
              imagedata: resized.toString('base64'),
              name: 'OSX Screenshot',
              format: 'auto',
              priority,
              origin: 'Hyperion OSX Grab',
            };

            axios
              .post(endpoint, data)
              .then(() => {
                // All done!
                if (DEBUG) console.log('post', Date.now() - resizeTime);
                if (DEBUG) console.log('--------------------------------');
              })
              .catch((err) => console.error(err));
          })
          .catch((err) => console.error(err));
      })
      .catch((err) => console.error(err));
  } catch (e) {
    console.error(e);
  }
}, 700);
