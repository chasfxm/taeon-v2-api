"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const HOST = "0.0.0.0";
const PORT = Number(process.env.PORT || 3215);

const DATA_DIR = path.join(__dirname, "data");
const HISTORY_FILE = path.join(DATA_DIR, "history.json");
const EXPENSE_FILE = path.join(DATA_DIR, "expenses.json");

const ALLOWED_ORIGINS = new Set([
  "https://taeon-v2.onrender.com",
  "http://127.0.0.1:3216",
  "http://localhost:3216"
]);

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function ensureJsonFile(filePath) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, "[]", "utf8");
  }
}

ensureJsonFile(HISTORY_FILE);
ensureJsonFile(EXPENSE_FILE);

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return [];
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(
    filePath,
    JSON.stringify(data, null, 2),
    "utf8"
  );
}

function nowIso() {
  return new Date().toISOString();
}

function id(prefix) {
  return (
    prefix +
    "-" +
    Date.now().toString(36).toUpperCase() +
    "-" +
    Math.random().toString(36).slice(2, 7).toUpperCase()
  );
}

function corsHeaders(req) {
  const origin = req.headers.origin || "";

  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400"
  };

  if (ALLOWED_ORIGINS.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  return headers;
}

function sendJson(req, res, status, payload) {
  res.writeHead(status, corsHeaders(req));
  res.end(JSON.stringify(payload, null, 2));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", chunk => {
      body += chunk;

      if (body.length > 2 * 1024 * 1024) {
        reject(new Error("REQUEST_TOO_LARGE"));
        req.destroy();
      }
    });

    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        resolve({
          text: body
        });
      }
    });

    req.on("error", reject);
  });
}

function normalizeMoney(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const cleaned = String(value).replace(/[^\d-]/g, "");

  if (!cleaned) {
    return null;
  }

  const number = Number(cleaned);

  return Number.isFinite(number)
    ? number
    : null;
}

function parseText(text) {

  const source = String(text || "").trim();

  const result = {
    rawText: source,
    documentType: null,
    company: null,
    amount: null,
    bank: null,
    account: null,
    recommendedGroup: null,
    recommendedPage: null
  };

  if (!source) {
    return result;
  }

  // ----------------------------------------------------------
  // 문서 종류
  // ----------------------------------------------------------

  if (
    source.includes("지출결의") ||
    source.includes("지급") ||
    source.includes("송금")
  ) {
    result.documentType = "지출결의";
    result.recommendedGroup = "01_회계경리";
    result.recommendedPage = "지출결의";
  }

  if (
    source.includes("급여") &&
    !result.documentType
  ) {
    result.documentType = "급여";
    result.recommendedGroup = "01_회계경리";
    result.recommendedPage = "급여";
  }

  if (
    source.includes("세금계산서") &&
    !result.documentType
  ) {
    result.documentType = "세금계산서";
    result.recommendedGroup = "01_회계경리";
    result.recommendedPage = "세금계산서";
  }

  // ----------------------------------------------------------
  // 회사
  // ----------------------------------------------------------

  if (
    /태온종합건설/.test(source)
  ) {
    result.company = "주식회사 태온종합건설";
  }

  if (
    /태온디자인/.test(source)
  ) {
    result.company = "태온디자인";
  }

  // ----------------------------------------------------------
  // 은행
  // ----------------------------------------------------------

  const bankMatch = source.match(
    /(국민은행|국민|KB|신한은행|신한|우리은행|우리|하나은행|하나|농협|NH|전북은행|전북|새마을금고|새마을|기업은행|기업|IBK|카카오뱅크|토스뱅크)/
  );

  if (bankMatch) {
    const bank = bankMatch[1];

    const bankMap = {
      "국민": "국민은행",
      "KB": "국민은행",
      "신한": "신한은행",
      "우리": "우리은행",
      "하나": "하나은행",
      "NH": "농협",
      "전북": "전북은행",
      "새마을": "새마을금고",
      "기업": "기업은행",
      "IBK": "기업은행"
    };

    result.bank = bankMap[bank] || bank;
  }

  // ----------------------------------------------------------
  // 계좌
  // ----------------------------------------------------------

  const accountMatch = source.match(
    /\b\d{2,6}[- ]?\d{2,6}[- ]?\d{2,8}\b/
  );

  if (accountMatch) {
    result.account = accountMatch[0];
  }

  // ----------------------------------------------------------
  // 금액
  // ----------------------------------------------------------

  const amountPatterns = [
    /(?:합계|금액|지급액|송금액|지출액)\s*[:：]?\s*([\d,]+)\s*원?/,
    /([\d,]{4,})\s*원/
  ];

  for (const pattern of amountPatterns) {

    const match = source.match(pattern);

    if (match) {
      result.amount = normalizeMoney(match[1]);
      break;
    }
  }

  return result;
}

function addHistory(entry) {

  const history = readJson(HISTORY_FILE);

  const item = {
    id: id("EVT"),
    createdAt: nowIso(),
    ...entry
  };

  history.unshift(item);

  if (history.length > 500) {
    history.length = 500;
  }

  writeJson(HISTORY_FILE, history);

  return item;
}

const server = http.createServer(async (req, res) => {

  const url = new URL(
    req.url,
    `http://${req.headers.host || "localhost"}`
  );

  const pathname = url.pathname;

  // ----------------------------------------------------------
  // CORS PRE-FLIGHT
  // ----------------------------------------------------------

  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders(req));
    res.end();
    return;
  }

  // ----------------------------------------------------------
  // ROOT
  // ----------------------------------------------------------

  if (
    req.method === "GET" &&
    pathname === "/"
  ) {

    sendJson(req, res, 200, {
      ok: true,
      service: "TAEON V2 WEB API",
      version: "1.0.0",
      status: "RUNNING",
      time: nowIso()
    });

    return;
  }

  // ----------------------------------------------------------
  // HEALTH
  // ----------------------------------------------------------

  if (
    req.method === "GET" &&
    pathname === "/api/health"
  ) {

    sendJson(req, res, 200, {
      ok: true,
      status: "PASS",
      service: "TAEON V2 WEB API",
      version: "1.0.0",
      environment: process.env.RENDER
        ? "RENDER"
        : "LOCAL",
      time: nowIso()
    });

    return;
  }

  // ----------------------------------------------------------
  // TEXT INTAKE
  // ----------------------------------------------------------

  if (
    req.method === "POST" &&
    pathname === "/api/intake/text"
  ) {

    try {

      const body = await readBody(req);

      const text =
        body.text ||
        body.content ||
        "";

      if (!String(text).trim()) {

        sendJson(req, res, 400, {
          ok: false,
          status: "FAIL",
          error: "텍스트가 없습니다."
        });

        return;
      }

      const parsed = parseText(text);

      const event = addHistory({
        type: "TEXT_INTAKE",
        title: parsed.documentType
          ? `${parsed.documentType} 텍스트 판독`
          : "텍스트 자동판독",
        page: parsed.recommendedPage,
        group: parsed.recommendedGroup,
        result: parsed
      });

      sendJson(req, res, 200, {
        ok: true,
        status: "SUCCESS",
        parsed,
        event
      });

    } catch (error) {

      sendJson(req, res, 500, {
        ok: false,
        status: "FAIL",
        error: error.message
      });
    }

    return;
  }

  // ----------------------------------------------------------
  // EXPENSE APPLY
  // ----------------------------------------------------------

  if (
    req.method === "POST" &&
    pathname === "/api/expense/apply"
  ) {

    try {

      const body = await readBody(req);

      const expenses = readJson(EXPENSE_FILE);

      const item = {
        id: id("EXP"),
        createdAt: nowIso(),
        company:
          body.company || "",
        title:
          body.title || body.subject || "",
        vendor:
          body.vendor || body.payee || "",
        description:
          body.description || body.memo || "",
        amount:
          normalizeMoney(body.amount),
        bank:
          body.bank || "",
        account:
          body.account || "",
        status:
          body.status || "대기",
        source:
          body.source || "WEB"
      };

      expenses.unshift(item);

      writeJson(
        EXPENSE_FILE,
        expenses
      );

      const event = addHistory({
        type: "EXPENSE_APPLY",
        title:
          item.title || "지출결의 등록",
        page: "지출결의",
        group: "01_회계경리",
        expenseId: item.id,
        amount: item.amount,
        company: item.company,
        status: item.status
      });

      sendJson(req, res, 200, {
        ok: true,
        status: "SUCCESS",
        expense: item,
        event
      });

    } catch (error) {

      sendJson(req, res, 500, {
        ok: false,
        status: "FAIL",
        error: error.message
      });
    }

    return;
  }

  // ----------------------------------------------------------
  // HISTORY GET
  // ----------------------------------------------------------

  if (
    req.method === "GET" &&
    pathname === "/api/pages/history"
  ) {

    const history = readJson(HISTORY_FILE);

    sendJson(req, res, 200, {
      ok: true,
      status: "SUCCESS",
      count: history.length,
      items: history
    });

    return;
  }

  // ----------------------------------------------------------
  // HISTORY POST
  // ----------------------------------------------------------

  if (
    req.method === "POST" &&
    pathname === "/api/pages/history"
  ) {

    try {

      const body = await readBody(req);

      const event = addHistory({
        type:
          body.type || "PAGE_EVENT",
        title:
          body.title || "업무이력",
        page:
          body.page || "",
        group:
          body.group || "",
        memo:
          body.memo || "",
        data:
          body.data || null
      });

      sendJson(req, res, 200, {
        ok: true,
        status: "SUCCESS",
        event
      });

    } catch (error) {

      sendJson(req, res, 500, {
        ok: false,
        status: "FAIL",
        error: error.message
      });
    }

    return;
  }

  // ----------------------------------------------------------
  // 404
  // ----------------------------------------------------------

  sendJson(req, res, 404, {
    ok: false,
    status: "FAIL",
    error: "API 경로 없음",
    path: pathname
  });
});

server.listen(
  PORT,
  HOST,
  () => {

    console.log(
      `[TAEON V2 API] RUNNING http://${HOST}:${PORT}`
    );

    console.log(
      `[TAEON V2 API] HEALTH /api/health`
    );
  }
);
