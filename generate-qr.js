const QRCode = require("qrcode");

const url = "https://ashtianyfit.com";

QRCode.toFile(
  "ashtianyfit-qr.png",
  url,
  {
    color: {
      dark: "#000000",
      light: "#ffffff",
    },
    width: 400,
  },
  (err) => {
    if (err) throw err;
    console.log("✅ QR code generated: ashtianyfit-qr.png");
  }
);
