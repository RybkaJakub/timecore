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
  const t1_raw = packet.readUIntLE(7, 3); // bajty 7, 8, 9
  t1 = t1_raw / 1000;
}

if (pocetDrah >= 2) {
  const t2_raw = packet.readUIntLE(11, 3); // bajty 11, 12, 13
  t2 = t2_raw / 1000;
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
  globalPort = null;
};

exports.sendToTimer = (data) => {
  console.log('[sendToTimer] Posílám:', data);
  if (!globalPort) {
    console.error('[sendToTimer] globalPort není definovaný');
    return;
  }

  console.log('[sendToTimer] globalPort.path:', globalPort.path);
  console.log('[sendToTimer] globalPort.isOpen:', globalPort.isOpen);

  if (globalPort.isOpen) {
    globalPort.write(data + '\n', (err) => {
      if (err) {
        console.error('[sendToTimer] Chyba při zápisu:', err.message);
      } else {
        console.log('[sendToTimer] Úspěšně odesláno');
      }
    });
  } else {
    console.error('[sendToTimer] Port není otevřený');
  }
};

