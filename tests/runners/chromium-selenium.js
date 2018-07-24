const fs = require('fs');
const spawn = require('child_process').spawn;

const archiver = require('archiver');
const chrome = require('selenium-webdriver/chrome');
const logging = require('selenium-webdriver/lib/logging');

async function switchToTestPage(driver) {
  let index = 0;
  let handles = [];
  while (!(await driver.getCurrentUrl()).startsWith('chrome-extension')) {
    // Refresh list of windows/tabs
    if (index >= handles.length) {
      index = 0;
      handles = await driver.getAllWindowHandles();
    }

    const handle = handles[index];
    await driver.switchTo().window(handle);

    index += 1;
  }
}

async function runSeleniumTests() {
  // console.log('Running selenium tests...');

  // Prepare chromium webdriver
  const chromeOptions = new chrome.Options()
    .addArguments('--no-sandbox')
    .addExtensions('./ext.zip');

  const service = new chrome.ServiceBuilder('./chromedriver').build();
  const driver = chrome.Driver.createSession(chromeOptions, service);

  // Run mock http server needed for tests
  const server = spawn('node', ['./tests/test-server.js']);

  let logInterval;

  const tearDown = () => {
    clearInterval(logInterval);
    server.kill();
    try {
      driver.quit().catch(() => { /* Browser already killed */ });
    } catch (ex) {
      /* Ignore any other exception */
    }
  };

  // Graceful shutdown
  process.on('SIGTERM', tearDown);

  await switchToTestPage(driver);

  // Get logs from Chromium
  logInterval = setInterval(
    () => {
      // Check if the browser is closed
      driver.getTitle()
        .then(() => {
          // Browser is open
          driver.manage().logs().get(logging.Type.BROWSER).then((entries) => {
            entries.forEach((entry) => {
              const message = entry.message;
              if (message.includes('TAP:  END')) {
                tearDown();
              } else if (message.includes('TAP:  ')) {
                const index = message.indexOf('TAP:  ');
                const cleaned = message.substr(index + 6).replace(/[\s"]+$/g, '');
                console.log(cleaned);
              }
            });
          });
        })
        .catch(() => {
          // Browser is closed
          tearDown();
        });
    },
    1000
  );
}


function main() {
  // Package chromium extension into a zip archive
  // console.log('Package extension...')
  const output = fs.createWriteStream('./ext.zip');
  const archive = archiver('zip', {
    zlib: { level: 1 } // Sets the compression level.
  });

  // listen for all archive data to be written
  output.on('close', () => {
    // console.log('Created ext.zip file');
    runSeleniumTests();
  });

  // good practice to catch this error explicitly
  archive.on('error', (err) => {
    throw err;
  });

  archive.pipe(output);
  archive.directory('build/', false);
  archive.finalize();
}


main();
