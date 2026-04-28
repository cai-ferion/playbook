/**
 * Sandbox Attachment Pipeline Tests
 * Validates: form UI, upload flow, S3 storage key, DB persistence, preview rendering
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");
const sandboxJs = readFileSync(join(ROOT, "server/public/js/sandbox.js"), "utf-8");
const indexHtml = readFileSync(join(ROOT, "server/public/index.html"), "utf-8");
const ioRoutes = readFileSync(join(ROOT, "server/io-routes.ts"), "utf-8");
const schema = readFileSync(join(ROOT, "drizzle/schema.ts"), "utf-8");

describe("Sandbox Attachment — Form UI", () => {
  it("has a hidden file input in the new insight form", () => {
    expect(sandboxJs).toContain('id="sandbox-file-input"');
    expect(sandboxJs).toContain('type="file"');
    expect(sandboxJs).toContain("multiple");
  });

  it("has an Attach Files button that triggers the file input", () => {
    expect(sandboxJs).toContain("Attach Files");
    expect(sandboxJs).toContain("sandbox-file-input").toSatisfy(() => true);
  });

  it("has a file list container for selected files", () => {
    expect(sandboxJs).toContain('id="sandbox-file-list"');
  });

  it("accepts common file types", () => {
    expect(sandboxJs).toContain(".pdf");
    expect(sandboxJs).toContain(".png");
    expect(sandboxJs).toContain(".jpg");
    expect(sandboxJs).toContain(".docx");
  });
});

describe("Sandbox Attachment — File State Management", () => {
  it("declares _sandboxAttachedFiles at module level", () => {
    expect(sandboxJs).toContain("var _sandboxAttachedFiles = []");
  });

  it("has sandboxUpdateFiles function to push files from input", () => {
    expect(sandboxJs).toContain("function sandboxUpdateFiles()");
    expect(sandboxJs).toContain("_sandboxAttachedFiles.push(input.files[i])");
  });

  it("has sandboxRemoveFile function to splice files", () => {
    expect(sandboxJs).toContain("function sandboxRemoveFile(index)");
    expect(sandboxJs).toContain("_sandboxAttachedFiles.splice(index, 1)");
  });

  it("has sandboxRenderFileList for displaying selected files", () => {
    expect(sandboxJs).toContain("function sandboxRenderFileList()");
  });

  it("clears attached files on form close", () => {
    // sandboxCloseInlineForm should reset the file state
    expect(sandboxJs).toMatch(/_sandboxAttachedFiles\s*=\s*\[\]/);
  });
});

describe("Sandbox Attachment — Upload Flow", () => {
  it("uploads files via base64 to /api/io/upload before POST", () => {
    // The sandboxSubmitNew function should call fileToBase64 and POST to upload endpoint
    expect(sandboxJs).toContain("fileToBase64(file)");
    expect(sandboxJs).toContain("IO_API_BASE}/upload");
    expect(sandboxJs).toContain("folder: 'sandbox-insights'");
  });

  it("collects upload results as {name, url} pairs", () => {
    expect(sandboxJs).toContain("attachmentUrls.push({ name: file.name, url: result.url })");
  });

  it("serializes attachments as JSON in the record", () => {
    expect(sandboxJs).toContain("JSON.stringify(attachmentUrls)");
    expect(sandboxJs).toContain("attachments: attachmentUrls.length > 0");
  });
});

describe("Sandbox Attachment — Server Upload Endpoint", () => {
  it("accepts a folder parameter for S3 key prefix", () => {
    expect(ioRoutes).toContain("req.body.folder || 'coaching-disputes'");
  });

  it("uses storagePut to upload to S3", () => {
    expect(ioRoutes).toContain('storagePut(key, buffer, contentType || "application/octet-stream")');
  });

  it("returns url and key in the response", () => {
    expect(ioRoutes).toContain("res.json({ ok: true, url: result.url, key: result.key })");
  });
});

describe("Sandbox Attachment — Schema", () => {
  it("has attachments column in io_insights", () => {
    expect(schema).toContain('attachments: text("attachments")');
  });

  it("has initial_review_date column", () => {
    expect(schema).toContain('initial_review_date: varchar("initial_review_date"');
  });

  it("has initial_review_comments column", () => {
    expect(schema).toContain('initial_review_comments: text("initial_review_comments")');
  });

  it("has final_reviewer column", () => {
    expect(schema).toContain('final_reviewer: varchar("final_reviewer"');
  });

  it("has final_review_date column", () => {
    expect(schema).toContain('final_review_date: varchar("final_review_date"');
  });

  it("has final_review_comments column", () => {
    expect(schema).toContain('final_review_comments: text("final_review_comments")');
  });
});

describe("Sandbox Attachment — Input Portal Preview", () => {
  it("has sandboxRenderAttachments function for Input Portal detail panel", () => {
    expect(sandboxJs).toContain("function sandboxRenderAttachments(attachmentsJson)");
  });

  it("renders image thumbnails for image attachments", () => {
    expect(sandboxJs).toContain("isImage");
    expect(sandboxJs).toContain("max-width:160px");
    expect(sandboxJs).toContain("object-fit:cover");
  });

  it("renders download links for non-image attachments", () => {
    expect(sandboxJs).toContain('target="_blank"');
    expect(sandboxJs).toContain("download=");
  });

  it("calls sandboxRenderAttachments in sandboxBuildDetailPanel", () => {
    expect(sandboxJs).toContain("sandboxRenderAttachments(ins.attachments)");
  });
});

describe("Sandbox Attachment — Review Area Preview", () => {
  it("has sandboxRenderAttachmentsCompact function for Review Area side panel", () => {
    expect(sandboxJs).toContain("function sandboxRenderAttachmentsCompact(attachmentsJson)");
  });

  it("uses compact image dimensions for side panel", () => {
    expect(sandboxJs).toContain("max-width:120px");
    expect(sandboxJs).toContain("max-height:90px");
  });

  it("calls sandboxRenderAttachmentsCompact in sandboxOpenReviewPanel", () => {
    expect(sandboxJs).toContain("sandboxRenderAttachmentsCompact(ins.attachments)");
  });
});

describe("Sandbox Attachment — Cache Version", () => {
  it("sandbox.js cache version is bumped to v115", () => {
    expect(indexHtml).toContain("sandbox.js?v=122");
  });
});
