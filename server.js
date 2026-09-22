"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const HOST = "0.0.0.0";
const PORT = Number(process.env.PORT || 3215);

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");

const HISTORY_FILE =
    path.join(DATA_DIR, "history.json");

const EXPENSE_FILE =
    path.join(DATA_DIR, "expenses.json");

const EVENTS_FILE =
    path.join(DATA_DIR, "events.json");

const DOCUMENTS_FILE =
    path.join(DATA_DIR, "documents.json");

const STAGED_FILE =
    path.join(DATA_DIR, "staged.json");


const ALLOWED_ORIGINS = new Set([
    "https://taeon-v2.onrender.com",
    "http://127.0.0.1:3216",
    "http://localhost:3216"
]);


if (!fs.existsSync(DATA_DIR)) {

    fs.mkdirSync(
        DATA_DIR,
        {
            recursive: true
        }
    );
}


function ensureJsonFile(filePath) {

    if (!fs.existsSync(filePath)) {

        fs.writeFileSync(
            filePath,
            "[]",
            "utf8"
        );
    }
}


[
    HISTORY_FILE,
    EXPENSE_FILE,
    EVENTS_FILE,
    DOCUMENTS_FILE,
    STAGED_FILE
].forEach(
    ensureJsonFile
);


function readJson(filePath) {

    try {

        const value =
            JSON.parse(
                fs.readFileSync(
                    filePath,
                    "utf8"
                )
            );

        return Array.isArray(value)
            ? value
            : [];

    } catch {

        return [];
    }
}


function writeJson(
    filePath,
    data
) {

    fs.writeFileSync(
        filePath,
        JSON.stringify(
            data,
            null,
            2
        ),
        "utf8"
    );
}


function nowIso() {

    return new Date()
        .toISOString();
}


function makeId(prefix) {

    return (
        prefix +
        "-" +
        Date.now()
            .toString(36)
            .toUpperCase() +
        "-" +
        Math.random()
            .toString(36)
            .slice(2, 7)
            .toUpperCase()
    );
}


function dateOnly(value) {

    if (!value) {
        return "";
    }

    return String(value)
        .substring(
            0,
            10
        );
}


function corsHeaders(req) {

    const origin =
        req.headers.origin || "";

    const headers = {

        "Content-Type":
            "application/json; charset=utf-8",

        "Access-Control-Allow-Methods":
            "GET,POST,PATCH,OPTIONS",

        "Access-Control-Allow-Headers":
            "Content-Type, Authorization",

        "Access-Control-Max-Age":
            "86400"
    };


    if (
        !origin ||
        ALLOWED_ORIGINS.has(origin)
    ) {

        headers[
            "Access-Control-Allow-Origin"
        ] =
            origin || "*";
    }


    return headers;
}


function sendJson(
    req,
    res,
    status,
    payload
) {

    res.writeHead(
        status,
        corsHeaders(req)
    );

    res.end(
        JSON.stringify(
            payload,
            null,
            2
        )
    );
}


function readBody(req) {

    return new Promise(
        (
            resolve,
            reject
        ) => {

            let body = "";


            req.on(
                "data",
                chunk => {

                    body += chunk;

                    if (
                        body.length >
                        20 * 1024 * 1024
                    ) {

                        reject(
                            new Error(
                                "REQUEST_TOO_LARGE"
                            )
                        );

                        req.destroy();
                    }
                }
            );


            req.on(
                "end",
                () => {

                    if (!body) {

                        resolve({});
                        return;
                    }


                    try {

                        resolve(
                            JSON.parse(body)
                        );

                    } catch {

                        resolve({
                            text: body
                        });
                    }
                }
            );


            req.on(
                "error",
                reject
            );
        }
    );
}


function normalizeMoney(value) {

    if (
        value === null ||
        value === undefined
    ) {
        return null;
    }


    const cleaned =
        String(value)
            .replace(
                /[^\d-]/g,
                ""
            );


    if (!cleaned) {
        return null;
    }


    const number =
        Number(cleaned);


    return Number.isFinite(number)
        ? number
        : null;
}


function parseText(text) {

    const source =
        String(text || "")
            .trim();


    const result = {

        rawText: source,

        documentType: null,

        company: null,

        amount: null,

        supplyAmount: null,

        vat: null,

        totalAmount: null,

        bank: null,

        account: null,

        date: null,

        businessNumber: null,

        site: null,

        recommendedGroup: null,

        recommendedPage: null
    };


    if (!source) {
        return result;
    }


    if (
        source.includes("지출결의") ||
        source.includes("지급") ||
        source.includes("송금")
    ) {

        result.documentType =
            "지출결의";

        result.recommendedGroup =
            "01_회계경리";

        result.recommendedPage =
            "지출결의";
    }


    if (
        !result.documentType &&
        source.includes("급여")
    ) {

        result.documentType =
            "급여";

        result.recommendedGroup =
            "01_회계경리";

        result.recommendedPage =
            "급여";
    }


    if (
        !result.documentType &&
        source.includes("세금계산서")
    ) {

        result.documentType =
            "세금계산서";

        result.recommendedGroup =
            "01_회계경리";

        result.recommendedPage =
            "세금계산서";
    }


    if (
        /태온종합건설/.test(source)
    ) {

        result.company =
            "주식회사 태온종합건설";
    }


    if (
        /태온디자인/.test(source)
    ) {

        result.company =
            "태온디자인";
    }


    const bankMatch =
        source.match(
            /(국민은행|국민|KB|신한은행|신한|우리은행|우리|하나은행|하나|농협|NH|전북은행|전북|새마을금고|새마을|기업은행|기업|IBK|카카오뱅크|토스뱅크)/
        );


    if (bankMatch) {

        const bank =
            bankMatch[1];


        const bankMap = {

            국민:
                "국민은행",

            KB:
                "국민은행",

            신한:
                "신한은행",

            우리:
                "우리은행",

            하나:
                "하나은행",

            NH:
                "농협",

            전북:
                "전북은행",

            새마을:
                "새마을금고",

            기업:
                "기업은행",

            IBK:
                "기업은행"
        };


        result.bank =
            bankMap[bank] ||
            bank;
    }


    const accountMatch =
        source.match(
            /\b\d{2,6}[- ]?\d{2,6}[- ]?\d{2,8}\b/
        );


    if (accountMatch) {

        result.account =
            accountMatch[0];
    }


    const amountPatterns = [

        /(?:합계금액|합계|금액|지급액|송금액|지출액)\s*[:：]?\s*([\d,]+)\s*원?/,

        /([\d,]{4,})\s*원/
    ];


    for (
        const pattern
        of amountPatterns
    ) {

        const match =
            source.match(pattern);


        if (match) {

            result.amount =
                normalizeMoney(
                    match[1]
                );

            break;
        }
    }


    const supplyMatch =
        source.match(
            /공급가액\s*[:：]?\s*([\d,]+)/
        );


    if (supplyMatch) {

        result.supplyAmount =
            normalizeMoney(
                supplyMatch[1]
            );
    }


    const vatMatch =
        source.match(
            /(?:부가세|세액)\s*[:：]?\s*([\d,]+)/
        );


    if (vatMatch) {

        result.vat =
            normalizeMoney(
                vatMatch[1]
            );
    }


    const totalMatch =
        source.match(
            /합계금액\s*[:：]?\s*([\d,]+)/
        );


    if (totalMatch) {

        result.totalAmount =
            normalizeMoney(
                totalMatch[1]
            );
    }


    const dateMatch =
        source.match(
            /(20\d{2})[.\-/년 ]\s*(\d{1,2})[.\-/월 ]\s*(\d{1,2})/
        );


    if (dateMatch) {

        result.date =
            [
                dateMatch[1],

                String(
                    dateMatch[2]
                ).padStart(
                    2,
                    "0"
                ),

                String(
                    dateMatch[3]
                ).padStart(
                    2,
                    "0"
                )

            ].join("-");
    }


    const businessMatch =
        source.match(
            /\b\d{3}-\d{2}-\d{5}\b/
        );


    if (businessMatch) {

        result.businessNumber =
            businessMatch[0];
    }


    return result;
}


function addHistory(entry) {

    const history =
        readJson(
            HISTORY_FILE
        );


    const item = {

        id:
            makeId("HIS"),

        createdAt:
            nowIso(),

        ...entry
    };


    history.unshift(
        item
    );


    if (
        history.length >
        500
    ) {

        history.length =
            500;
    }


    writeJson(
        HISTORY_FILE,
        history
    );


    return item;
}


function normalizeEvent(input = {}) {

    const now =
        nowIso();


    return {

        eventId:
            input.eventId ||
            makeId("EVT"),

        type:
            input.type ||
            "JOURNAL",

        typeLabel:
            input.typeLabel ||
            input.type ||
            "업무",

        title:
            input.title ||
            "업무",

        content:
            input.content ||
            "",

        company:
            input.company ||
            "",

        site:
            input.site ||
            "",

        people:
            Array.isArray(
                input.people
            )
                ? input.people
                : [],

        status:
            input.status ||
            "OPEN",

        tags:
            Array.isArray(
                input.tags
            )
                ? input.tags
                : [],

        source:
            input.source ||
            "TAEON_V2_WEB",

        followUp:
            input.followUp ||
            null,

        relatedDocumentIds:
            Array.isArray(
                input.relatedDocumentIds
            )
                ? input.relatedDocumentIds
                : [],

        occurredAt:
            input.occurredAt ||
            now,

        createdAt:
            input.createdAt ||
            now,

        updatedAt:
            now
    };
}


function addEvent(input) {

    const events =
        readJson(
            EVENTS_FILE
        );


    const event =
        normalizeEvent(
            input
        );


    events.unshift(
        event
    );


    writeJson(
        EVENTS_FILE,
        events
    );


    addHistory({

        type:
            "EVENT_CREATE",

        title:
            event.title,

        company:
            event.company,

        site:
            event.site,

        eventId:
            event.eventId,

        status:
            event.status,

        tags:
            event.tags
    });


    return event;
}


function makeDocument(input = {}) {

    return {

        documentId:
            input.documentId ||
            makeId("DOC"),

        filePath:
            input.filePath ||
            "",

        fileName:
            input.fileName ||
            "",

        title:
            input.title ||
            "문서",

        content:
            input.content ||
            "",

        company:
            input.company ||
            "",

        site:
            input.site ||
            "",

        tags:
            Array.isArray(
                input.tags
            )
                ? input.tags
                : [],

        fields:
            input.fields ||
            null,

        createdAt:
            nowIso(),

        updatedAt:
            nowIso()
    };
}


function addDocument(input) {

    const documents =
        readJson(
            DOCUMENTS_FILE
        );


    const document =
        makeDocument(
            input
        );


    documents.unshift(
        document
    );


    writeJson(
        DOCUMENTS_FILE,
        documents
    );


    return document;
}


function buildFollowups(
    events,
    targetDate
) {

    const items = {

        overdue: [],

        today: [],

        upcoming: [],

        unscheduled: [],

        completed: []
    };


    for (
        const event
        of events
    ) {

        if (
            !event.followUp ||
            event.followUp.required !== true
        ) {
            continue;
        }


        const due =
            dateOnly(
                event.followUp.dueAt
            );


        const done =
            event.status === "DONE" ||
            event.followUp.status ===
                "DONE";


        if (done) {

            items.completed.push(
                event
            );

            continue;
        }


        if (!due) {

            items.unscheduled.push(
                event
            );

            continue;
        }


        if (
            due <
            targetDate
        ) {

            items.overdue.push(
                event
            );

            continue;
        }


        if (
            due ===
            targetDate
        ) {

            items.today.push(
                event
            );

            continue;
        }


        items.upcoming.push(
            event
        );
    }


    return items;
}


function buildJournal(
    events,
    targetDate
) {

    const dayEvents =
        events.filter(
            event =>
                dateOnly(
                    event.occurredAt ||
                    event.createdAt
                ) ===
                targetDate
        );


    const open =
        dayEvents.filter(
            event =>
                event.status !==
                "DONE"
        );


    const done =
        dayEvents.filter(
            event =>
                event.status ===
                "DONE"
        );


    const followUps =
        dayEvents.filter(
            event =>
                event.followUp &&
                event.followUp.required ===
                    true
        );


    const documentIds =
        new Set();


    for (
        const event
        of dayEvents
    ) {

        for (
            const documentId
            of (
                event.relatedDocumentIds ||
                []
            )
        ) {

            documentIds.add(
                documentId
            );
        }
    }


    const development =
        dayEvents.filter(
            event =>
                Array.isArray(
                    event.tags
                ) &&
                (
                    event.tags.includes(
                        "프로그램"
                    ) ||
                    event.tags.includes(
                        "개발"
                    )
                )
        );


    const lines = [];


    lines.push(
        `${targetDate} 업무일지`
    );

    lines.push("");


    if (
        dayEvents.length ===
        0
    ) {

        lines.push(
            "등록된 업무가 없습니다."
        );
    }


    for (
        const event
        of dayEvents
    ) {

        let line =
            `- ${event.title}`;


        if (event.company) {

            line +=
                ` / ${event.company}`;
        }


        if (event.site) {

            line +=
                ` / ${event.site}`;
        }


        line +=
            ` / ${event.status}`;


        lines.push(
            line
        );
    }


    return {

        summary: {

            total:
                dayEvents.length,

            open:
                open.length,

            done:
                done.length,

            followUp:
                followUps.length,

            documents:
                documentIds.size,

            development:
                development.length
        },

        journalText:
            lines.join("\n")
    };
}


const server =
    http.createServer(
        async (
            req,
            res
        ) => {

            const url =
                new URL(
                    req.url,
                    `http://${req.headers.host || "localhost"}`
                );


            const pathname =
                url.pathname;


            if (
                req.method ===
                "OPTIONS"
            ) {

                res.writeHead(
                    204,
                    corsHeaders(req)
                );

                res.end();

                return;
            }


            if (
                req.method === "GET" &&
                pathname === "/"
            ) {

                sendJson(
                    req,
                    res,
                    200,
                    {
                        ok: true,

                        service:
                            "TAEON V2 WEB API",

                        version:
                            "2.0.0",

                        status:
                            "RUNNING",

                        time:
                            nowIso()
                    }
                );

                return;
            }


            if (
                req.method === "GET" &&
                (
                    pathname ===
                        "/api/health" ||
                    pathname ===
                        "/health"
                )
            ) {

                sendJson(
                    req,
                    res,
                    200,
                    {
                        ok: true,

                        status:
                            "PASS",

                        service:
                            "TAEON V2 WEB API",

                        version:
                            "2.0.0",

                        environment:
                            process.env.RENDER
                                ? "RENDER"
                                : "LOCAL",

                        endpoints: {

                            events: true,

                            documents: true,

                            intake: true,

                            followups: true,

                            journal: true
                        },

                        time:
                            nowIso()
                    }
                );

                return;
            }


            if (
                req.method === "GET" &&
                pathname ===
                    "/api/events"
            ) {

                const events =
                    readJson(
                        EVENTS_FILE
                    );


                sendJson(
                    req,
                    res,
                    200,
                    {
                        ok: true,

                        count:
                            events.length,

                        events
                    }
                );

                return;
            }


            if (
                req.method === "POST" &&
                pathname ===
                    "/api/events"
            ) {

                try {

                    const body =
                        await readBody(req);


                    const event =
                        addEvent(
                            body
                        );


                    sendJson(
                        req,
                        res,
                        200,
                        {
                            ok: true,

                            status:
                                "SUCCESS",

                            eventId:
                                event.eventId,

                            event
                        }
                    );

                } catch (error) {

                    sendJson(
                        req,
                        res,
                        500,
                        {
                            ok: false,

                            status:
                                "FAIL",

                            message:
                                error.message
                        }
                    );
                }

                return;
            }


            const eventStatusMatch =
                pathname.match(
                    /^\/api\/events\/([^/]+)\/status$/
                );


            if (
                req.method === "PATCH" &&
                eventStatusMatch
            ) {

                try {

                    const body =
                        await readBody(req);


                    const eventId =
                        decodeURIComponent(
                            eventStatusMatch[1]
                        );


                    const events =
                        readJson(
                            EVENTS_FILE
                        );


                    const event =
                        events.find(
                            item =>
                                item.eventId ===
                                eventId
                        );


                    if (!event) {

                        sendJson(
                            req,
                            res,
                            404,
                            {
                                ok: false,

                                status:
                                    "FAIL",

                                message:
                                    "업무를 찾지 못했습니다."
                            }
                        );

                        return;
                    }


                    event.status =
                        body.status ||
                        event.status;


                    event.updatedAt =
                        nowIso();


                    if (
                        event.followUp &&
                        body.status ===
                            "DONE"
                    ) {

                        event.followUp.status =
                            "DONE";
                    }


                    writeJson(
                        EVENTS_FILE,
                        events
                    );


                    sendJson(
                        req,
                        res,
                        200,
                        {
                            ok: true,

                            status:
                                "SUCCESS",

                            event
                        }
                    );

                } catch (error) {

                    sendJson(
                        req,
                        res,
                        500,
                        {
                            ok: false,

                            status:
                                "FAIL",

                            message:
                                error.message
                        }
                    );
                }

                return;
            }


            if (
                req.method === "POST" &&
                pathname ===
                    "/api/documents/register"
            ) {

                try {

                    const body =
                        await readBody(req);


                    const document =
                        addDocument(
                            body
                        );


                    const event =
                        addEvent({

                            type:
                                "DOCUMENT",

                            typeLabel:
                                "문서",

                            title:
                                document.title,

                            content:
                                document.content,

                            company:
                                document.company,

                            site:
                                document.site,

                            status:
                                "OPEN",

                            tags:
                                document.tags,

                            source:
                                "TAEON_V2_DOCUMENT",

                            relatedDocumentIds: [
                                document.documentId
                            ]
                        });


                    sendJson(
                        req,
                        res,
                        200,
                        {
                            ok: true,

                            status:
                                "SUCCESS",

                            documentId:
                                document.documentId,

                            document,

                            event
                        }
                    );

                } catch (error) {

                    sendJson(
                        req,
                        res,
                        500,
                        {
                            ok: false,

                            status:
                                "FAIL",

                            message:
                                error.message
                        }
                    );
                }

                return;
            }


            if (
                req.method === "POST" &&
                pathname ===
                    "/api/intake/preview"
            ) {

                try {

                    const body =
                        await readBody(req);


                    const mode =
                        body.mode ||
                        "TEXT";


                    const fileName =
                        body.fileName ||
                        "직접입력.txt";


                    const extension =
                        (
                            path.extname(
                                fileName
                            ) ||
                            ".txt"
                        )
                            .replace(
                                ".",
                                ""
                            )
                            .toUpperCase();


                    let text = "";

                    let manualRequired =
                        false;


                    if (
                        mode ===
                        "TEXT"
                    ) {

                        text =
                            String(
                                body.text ||
                                ""
                            );
                    }


                    if (
                        mode ===
                        "FILE"
                    ) {

                        const textExtensions =
                            new Set([
                                "TXT",
                                "CSV",
                                "JSON",
                                "MD"
                            ]);


                        if (
                            textExtensions.has(
                                extension
                            ) &&
                            body.base64
                        ) {

                            text =
                                Buffer
                                    .from(
                                        body.base64,
                                        "base64"
                                    )
                                    .toString(
                                        "utf8"
                                    );

                        } else {

                            manualRequired =
                                true;
                        }
                    }


                    const parsed =
                        parseText(
                            text
                        );


                    const fields = {

                        documentType:
                            parsed.documentType,

                        bank:
                            parsed.bank,

                        account:
                            parsed.account,

                        amount:
                            parsed.amount,

                        supplyAmount:
                            parsed.supplyAmount,

                        vat:
                            parsed.vat,

                        totalAmount:
                            parsed.totalAmount,

                        company:
                            parsed.company,

                        date:
                            parsed.date,

                        businessNumber:
                            parsed.businessNumber,

                        site:
                            parsed.site
                    };


                    const staged =
                        readJson(
                            STAGED_FILE
                        );


                    const item = {

                        stagedId:
                            makeId("STG"),

                        mode,

                        fileName,

                        extension,

                        mimeType:
                            body.mimeType ||
                            "",

                        text,

                        fields,

                        createdAt:
                            nowIso()
                    };


                    staged.unshift(
                        item
                    );


                    if (
                        staged.length >
                        100
                    ) {

                        staged.length =
                            100;
                    }


                    writeJson(
                        STAGED_FILE,
                        staged
                    );


                    sendJson(
                        req,
                        res,
                        200,
                        {
                            ok: true,

                            status:
                                "SUCCESS",

                            stagedId:
                                item.stagedId,

                            fileName,

                            extension,

                            textLength:
                                text.length,

                            previewText:
                                text.substring(
                                    0,
                                    5000
                                ),

                            fields,

                            manualRequired,

                            message:
                                manualRequired
                                    ? "현재 Render API에서는 PDF·Excel 원문 추출은 로컬 문서엔진 연결 전입니다. 텍스트 붙여넣기를 사용하세요."
                                    : "자동판독 완료"
                        }
                    );

                } catch (error) {

                    sendJson(
                        req,
                        res,
                        500,
                        {
                            ok: false,

                            status:
                                "FAIL",

                            message:
                                error.message
                        }
                    );
                }

                return;
            }


            if (
                req.method === "POST" &&
                pathname ===
                    "/api/intake/apply"
            ) {

                try {

                    const body =
                        await readBody(req);


                    const staged =
                        readJson(
                            STAGED_FILE
                        );


                    const item =
                        staged.find(
                            row =>
                                row.stagedId ===
                                body.stagedId
                        );


                    if (!item) {

                        sendJson(
                            req,
                            res,
                            404,
                            {
                                ok: false,

                                status:
                                    "FAIL",

                                message:
                                    "판독 임시자료를 찾지 못했습니다."
                            }
                        );

                        return;
                    }


                    const tags = [

                        body.moduleCode,

                        body.moduleName,

                        body.moduleFolder,

                        body.feature

                    ].filter(Boolean);


                    const document =
                        addDocument({

                            fileName:
                                item.fileName,

                            title:
                                body.title ||
                                item.fileName ||
                                "자동판독 문서",

                            content:
                                body.content ||
                                item.text,

                            company:
                                body.company ||
                                item.fields?.company ||
                                "",

                            site:
                                body.site ||
                                item.fields?.site ||
                                "",

                            tags,

                            fields:
                                item.fields
                        });


                    const events =
                        readJson(
                            EVENTS_FILE
                        );


                    let event =
                        null;


                    if (
                        body.eventId
                    ) {

                        event =
                            events.find(
                                row =>
                                    row.eventId ===
                                    body.eventId
                            );
                    }


                    if (event) {

                        if (
                            !Array.isArray(
                                event.relatedDocumentIds
                            )
                        ) {

                            event.relatedDocumentIds =
                                [];
                        }


                        if (
                            !event.relatedDocumentIds.includes(
                                document.documentId
                            )
                        ) {

                            event.relatedDocumentIds.push(
                                document.documentId
                            );
                        }


                        event.updatedAt =
                            nowIso();


                        writeJson(
                            EVENTS_FILE,
                            events
                        );
                    }


                    if (!event) {

                        event =
                            addEvent({

                                type:
                                    "DOCUMENT",

                                typeLabel:
                                    "자동판독",

                                title:
                                    body.title ||
                                    `${body.feature || "업무"} 자료`,

                                content:
                                    body.content ||
                                    item.text,

                                company:
                                    body.company ||
                                    item.fields?.company ||
                                    "",

                                site:
                                    body.site ||
                                    item.fields?.site ||
                                    "",

                                status:
                                    "OPEN",

                                tags,

                                source:
                                    "TAEON_V2_INTAKE",

                                relatedDocumentIds: [
                                    document.documentId
                                ]
                            });
                    }


                    sendJson(
                        req,
                        res,
                        200,
                        {
                            ok: true,

                            status:
                                "SUCCESS",

                            documentId:
                                document.documentId,

                            document,

                            event
                        }
                    );

                } catch (error) {

                    sendJson(
                        req,
                        res,
                        500,
                        {
                            ok: false,

                            status:
                                "FAIL",

                            message:
                                error.message
                        }
                    );
                }

                return;
            }


            if (
                req.method === "GET" &&
                pathname ===
                    "/api/followups"
            ) {

                const targetDate =
                    url.searchParams
                        .get("date") ||
                    dateOnly(
                        nowIso()
                    );


                const events =
                    readJson(
                        EVENTS_FILE
                    );


                const items =
                    buildFollowups(
                        events,
                        targetDate
                    );


                sendJson(
                    req,
                    res,
                    200,
                    {
                        ok: true,

                        date:
                            targetDate,

                        summary: {

                            overdue:
                                items.overdue.length,

                            today:
                                items.today.length,

                            upcoming:
                                items.upcoming.length,

                            unscheduled:
                                items.unscheduled.length,

                            completed:
                                items.completed.length
                        },

                        items
                    }
                );

                return;
            }


            if (
                req.method === "GET" &&
                pathname ===
                    "/api/journal/daily"
            ) {

                const targetDate =
                    url.searchParams
                        .get("date") ||
                    dateOnly(
                        nowIso()
                    );


                const events =
                    readJson(
                        EVENTS_FILE
                    );


                const journal =
                    buildJournal(
                        events,
                        targetDate
                    );


                sendJson(
                    req,
                    res,
                    200,
                    {
                        ok: true,

                        date:
                            targetDate,

                        ...journal
                    }
                );

                return;
            }


            if (
                req.method === "POST" &&
                pathname ===
                    "/api/intake/text"
            ) {

                try {

                    const body =
                        await readBody(req);


                    const text =
                        body.text ||
                        body.content ||
                        "";


                    if (
                        !String(text)
                            .trim()
                    ) {

                        sendJson(
                            req,
                            res,
                            400,
                            {
                                ok: false,

                                status:
                                    "FAIL",

                                error:
                                    "텍스트가 없습니다."
                            }
                        );

                        return;
                    }


                    const parsed =
                        parseText(
                            text
                        );


                    const event =
                        addHistory({

                            type:
                                "TEXT_INTAKE",

                            title:
                                parsed.documentType
                                    ? `${parsed.documentType} 텍스트 판독`
                                    : "텍스트 자동판독",

                            page:
                                parsed.recommendedPage,

                            group:
                                parsed.recommendedGroup,

                            result:
                                parsed
                        });


                    sendJson(
                        req,
                        res,
                        200,
                        {
                            ok: true,

                            status:
                                "SUCCESS",

                            parsed,

                            event
                        }
                    );

                } catch (error) {

                    sendJson(
                        req,
                        res,
                        500,
                        {
                            ok: false,

                            status:
                                "FAIL",

                            error:
                                error.message
                        }
                    );
                }

                return;
            }


            if (
                req.method === "POST" &&
                pathname ===
                    "/api/expense/apply"
            ) {

                try {

                    const body =
                        await readBody(req);


                    const expenses =
                        readJson(
                            EXPENSE_FILE
                        );


                    const item = {

                        id:
                            makeId("EXP"),

                        createdAt:
                            nowIso(),

                        company:
                            body.company ||
                            "",

                        title:
                            body.title ||
                            body.subject ||
                            "",

                        vendor:
                            body.vendor ||
                            body.payee ||
                            "",

                        description:
                            body.description ||
                            body.memo ||
                            "",

                        amount:
                            normalizeMoney(
                                body.amount
                            ),

                        bank:
                            body.bank ||
                            "",

                        account:
                            body.account ||
                            "",

                        status:
                            body.status ||
                            "대기",

                        source:
                            body.source ||
                            "WEB"
                    };


                    expenses.unshift(
                        item
                    );


                    writeJson(
                        EXPENSE_FILE,
                        expenses
                    );


                    const event =
                        addHistory({

                            type:
                                "EXPENSE_APPLY",

                            title:
                                item.title ||
                                "지출결의 등록",

                            page:
                                "지출결의",

                            group:
                                "01_회계경리",

                            expenseId:
                                item.id,

                            amount:
                                item.amount,

                            company:
                                item.company,

                            status:
                                item.status
                        });


                    sendJson(
                        req,
                        res,
                        200,
                        {
                            ok: true,

                            status:
                                "SUCCESS",

                            expense:
                                item,

                            event
                        }
                    );

                } catch (error) {

                    sendJson(
                        req,
                        res,
                        500,
                        {
                            ok: false,

                            status:
                                "FAIL",

                            error:
                                error.message
                        }
                    );
                }

                return;
            }


            if (
                req.method === "GET" &&
                pathname ===
                    "/api/pages/history"
            ) {

                const history =
                    readJson(
                        HISTORY_FILE
                    );


                sendJson(
                    req,
                    res,
                    200,
                    {
                        ok: true,

                        status:
                            "SUCCESS",

                        count:
                            history.length,

                        items:
                            history
                    }
                );

                return;
            }


            if (
                req.method === "POST" &&
                pathname ===
                    "/api/pages/history"
            ) {

                try {

                    const body =
                        await readBody(req);


                    const event =
                        addHistory({

                            type:
                                body.type ||
                                "PAGE_EVENT",

                            title:
                                body.title ||
                                "업무이력",

                            page:
                                body.page ||
                                "",

                            group:
                                body.group ||
                                "",

                            memo:
                                body.memo ||
                                "",

                            data:
                                body.data ||
                                null
                        });


                    sendJson(
                        req,
                        res,
                        200,
                        {
                            ok: true,

                            status:
                                "SUCCESS",

                            event
                        }
                    );

                } catch (error) {

                    sendJson(
                        req,
                        res,
                        500,
                        {
                            ok: false,

                            status:
                                "FAIL",

                            error:
                                error.message
                        }
                    );
                }

                return;
            }


            sendJson(
                req,
                res,
                404,
                {
                    ok: false,

                    status:
                        "FAIL",

                    error:
                        "API 경로 없음",

                    message:
                        "API 경로 없음",

                    path:
                        pathname
                }
            );
        }
    );


server.listen(
    PORT,
    HOST,
    () => {

        console.log(
            `[TAEON V2 API V2] RUNNING http://${HOST}:${PORT}`
        );

        console.log(
            "[TAEON V2 API V2] /api/health"
        );

        console.log(
            "[TAEON V2 API V2] /api/events"
        );

        console.log(
            "[TAEON V2 API V2] /api/documents/register"
        );

        console.log(
            "[TAEON V2 API V2] /api/intake/preview"
        );

        console.log(
            "[TAEON V2 API V2] /api/intake/apply"
        );

        console.log(
            "[TAEON V2 API V2] /api/followups"
        );

        console.log(
            "[TAEON V2 API V2] /api/journal/daily"
        );
    }
);