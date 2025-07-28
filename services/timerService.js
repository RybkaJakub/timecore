const { SerialPort } = require('serialport');

let globalPort = null;

exports.openTimer = (portPath, onData) => {
  if (globalPort) {
    console.log('Port už je otevřený.');
    return;
  }

  globalPort = new SerialPort({
    path: portPath,
    baudRate: 9600,
    autoOpen: true,
  });

  let rawBuffer = Buffer.alloc(0);

  globalPort.on('data', (chunk) => {
    // Připoj chunk do bufferu
    rawBuffer = Buffer.concat([rawBuffer, chunk]);

    // Zkus najít celý rámec
    while (true) {
      const startIdx = rawBuffer.indexOf(Buffer.from('RW:'));
      if (startIdx === -1) {
        break;
      }

      if (rawBuffer.length < startIdx + 20) {
        // ještě není celý packet
        break;
      }

      const packet = rawBuffer.slice(startIdx, startIdx + 20);

      // Parsuj packet
      const stav = packet[3];
      const pocetDrah = packet[4];

      let t1 = null;
      let t2 = null;

      if (pocetDrah >= 1) {
        const low = packet[7];
        const high = packet[8];
        t1 = (low + high * 256) * 0.001;
      }

      if (pocetDrah >= 2) {
        const low2 = packet[11];
        const high2 = packet[12];
        t2 = (low2 + high2 * 256) * 0.001;
      }

      const result = {
        stav,
        drah: pocetDrah,
        times: [t1, t2],
      };

      console.log('Parsovaný packet:', result);

      onData(result, packet.toString('hex'));

      // Ořízni z bufferu tento packet
      rawBuffer = rawBuffer.slice(startIdx + 20);
    }
  });

  globalPort.on('error', (err) => {
    console.log('SerialPort Error:', err);
  });
};

exports.closeTimer = () => {
  if (!globalPort || !globalPort.isOpen) {
    console.log('Port už je zavřený.');
    return;
  }

  globalPort.close()
};

exports.sendToTimer = (data) => {
  if (globalPort) {
    globalPort.write(data + "\n");
  }
};
