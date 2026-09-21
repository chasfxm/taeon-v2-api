"use strict";

const http = require("http");

function request(method, path, body) {
  return new Promise((resolve, reject) => {

    const text = body
      ? JSON.stringify(body)
      : "";

    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: 3215,
        method,
        path,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(text)
        }
      },
      res => {

        let data = "";

        res.on("data", chunk => {
          data += chunk;
        });

        res.on("end", () => {
          resolve({
            statusCode: res.statusCode,
            body: data
          });
        });
      }
    );

    req.on("error", reject);

    if (text) {
      req.write(text);
    }

    req.end();
  });
}

(async () => {

  try {

    const health = await request(
      "GET",
      "/api/health"
    );

    console.log("[HEALTH]");
    console.log(health.body);

    const intake = await request(
      "POST",
      "/api/intake/text",
      {
        text:
          "주식회사 태온종합건설 지출결의 국민은행 782701-04-122481 지급액 2,644,530원"
      }
    );

    console.log("");
    console.log("[TEXT INTAKE]");
    console.log(intake.body);

    console.log("");
    console.log("[PASS] TAEON V2 WEB API TEST");

  } catch (error) {

    console.error(
      "[FAIL]",
      error.message
    );

    process.exit(1);
  }
})();
