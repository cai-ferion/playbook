import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const compassJsPath = path.join(__dirname, "public/js/compass.js");
const compassJs = fs.readFileSync(compassJsPath, "utf-8");

const indexHtmlPath = path.join(__dirname, "public/index.html");
const indexHtml = fs.readFileSync(indexHtmlPath, "utf-8");

const ioRoutesPath = path.join(__dirname, "io-routes.ts");
const ioRoutes = fs.readFileSync(ioRoutesPath, "utf-8");

const schemaPath = path.join(__dirname, "../drizzle/schema.ts");
const schema = fs.readFileSync(schemaPath, "utf-8");

// ============================================================
// Compass Attachment Pipeline Tests
// ============================================================

describe("Compass Attachment Pipeline", () => {

  // ---- Schema ----
  describe("Schema", () => {
    it("io_coaching has an attachments column", () => {
      // Find the ioCoaching table definition and check for attachments
      const coachingSection = schema.slice(
        schema.indexOf('mysqlTable("io_coaching"'),
        schema.indexOf('mysqlTable("io_coaching"') + 3000
      );
      expect(coachingSection).toContain('attachments: text("attachments")');
    });

    it("io_coaching has dispute_attachments column", () => {
      const coachingSection = schema.slice(
        schema.indexOf('mysqlTable("io_coaching"'),
        schema.indexOf('mysqlTable("io_coaching"') + 3000
      );
      expect(coachingSection).toContain('dispute_attachments: text("dispute_attachments")');
    });
  });

  // ---- Form UI ----
  describe("Form UI", () => {
    it("has a file input element for attachments", () => {
      expect(compassJs).toContain('id="compass-attachments"');
      expect(compassJs).toContain('type="file"');
    });

    it("file input accepts correct file types", () => {
      expect(compassJs).toContain('.pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.gif,.bmp,.webp');
    });

    it("has an attachment list display element", () => {
      expect(compassJs).toContain('id="compass-attachment-list"');
    });

    it("has compassUpdateAttachmentList function", () => {
      expect(compassJs).toContain("function compassUpdateAttachmentList()");
    });

    it("has compassRemoveAttachment function", () => {
      expect(compassJs).toContain("function compassRemoveAttachment(index)");
    });

    it("has compassRenderAttachmentList function", () => {
      expect(compassJs).toContain("function compassRenderAttachmentList()");
    });

    it("compassAttachedFiles array is declared", () => {
      expect(compassJs).toContain("var compassAttachedFiles = []");
    });
  });

  // ---- Upload Logic in compassSubmitNew (single log) ----
  describe("Single Log Upload Logic", () => {
    // Extract the section between "Upload attachments if any" and the POST call
    const uploadSection = compassJs.slice(
      compassJs.indexOf("// Upload attachments if any"),
      compassJs.indexOf("// Upload attachments if any") + 1500
    );

    it("checks compassAttachedFiles before upload", () => {
      expect(uploadSection).toContain("compassAttachedFiles.length > 0");
    });

    it("calls fileToBase64 for each file", () => {
      expect(uploadSection).toContain("await fileToBase64(file)");
    });

    it("calls the upload endpoint with correct payload", () => {
      expect(uploadSection).toContain("IO_API_BASE}/upload");
      expect(uploadSection).toContain("fileName: file.name");
      expect(uploadSection).toContain("contentType: file.type");
      expect(uploadSection).toContain("data: base64");
    });

    it("uses compass folder prefix for S3 organization", () => {
      expect(uploadSection).toContain("folder: 'compass'");
    });

    it("builds uploadedAttachments array with name and url", () => {
      expect(uploadSection).toContain("uploadedAttachments.push({ name: file.name, url: result.url })");
    });

    it("serializes attachments as JSON on the record", () => {
      expect(uploadSection).toContain("record.attachments = JSON.stringify(uploadedAttachments)");
    });

    it("handles upload errors gracefully", () => {
      expect(uploadSection).toContain("catch (upErr)");
      expect(uploadSection).toContain("console.error('Failed to upload attachment:'");
    });
  });

  // ---- Upload Logic in Group Coaching ----
  describe("Group Coaching Upload Logic", () => {
    const groupSection = compassJs.slice(
      compassJs.indexOf("// Upload attachments once for group coaching"),
      compassJs.indexOf("// Upload attachments once for group coaching") + 1500
    );

    it("uploads attachments once before the loop", () => {
      expect(groupSection).toContain("let groupAttachmentsJson = null");
      expect(groupSection).toContain("compassAttachedFiles.length > 0");
    });

    it("calls fileToBase64 for group attachments", () => {
      expect(groupSection).toContain("await fileToBase64(file)");
    });

    it("uses compass folder prefix", () => {
      expect(groupSection).toContain("folder: 'compass'");
    });

    it("stores result as groupAttachmentsJson", () => {
      expect(groupSection).toContain("groupAttachmentsJson = JSON.stringify(uploadedAttachments)");
    });

    it("spreads groupAttachmentsJson into individual records", () => {
      expect(compassJs).toContain("...(groupAttachmentsJson ? { attachments: groupAttachmentsJson } : {})");
    });
  });

  // ---- Form Reset ----
  describe("Form Reset", () => {
    it("clears compassAttachedFiles array on form reset", () => {
      // The reset is in _compassResetFormFields which is called by _compassResetFormFieldsForNext
      const resetIdx = compassJs.indexOf("function _compassResetFormFields()");
      const resetSection = compassJs.slice(resetIdx, resetIdx + 3200);
      expect(resetSection).toContain("compassAttachedFiles = []");
    });

    it("clears attachment list DOM on reset", () => {
      const resetIdx = compassJs.indexOf("function _compassResetFormFields()");
      const resetSection = compassJs.slice(resetIdx, resetIdx + 3200);
      expect(resetSection).toContain("compass-attachment-list");
    });
  });

  // ---- Detail Rendering ----
  describe("Detail Rendering", () => {
    it("has compassRenderAttachmentsDetail function", () => {
      expect(compassJs).toContain("function compassRenderAttachmentsDetail(log)");
    });

    it("parses JSON attachments", () => {
      const renderSection = compassJs.slice(
        compassJs.indexOf("function compassRenderAttachmentsDetail"),
        compassJs.indexOf("function compassRenderAttachmentsDetail") + 1200
      );
      expect(renderSection).toContain("JSON.parse(log.attachments)");
    });

    it("has fallback for comma-separated URLs", () => {
      const renderSection = compassJs.slice(
        compassJs.indexOf("function compassRenderAttachmentsDetail"),
        compassJs.indexOf("function compassRenderAttachmentsDetail") + 1200
      );
      expect(renderSection).toContain("split(',')");
    });

    it("renders download links for attachments", () => {
      const renderIdx = compassJs.indexOf("function compassRenderAttachmentsDetail");
      const renderSection = compassJs.slice(renderIdx, renderIdx + 2000);
      expect(renderSection).toContain("download");
    });

    it("renders image preview button for image attachments", () => {
      const renderIdx = compassJs.indexOf("function compassRenderAttachmentsDetail");
      const renderSection = compassJs.slice(renderIdx, renderIdx + 2000);
      expect(renderSection).toContain("compassPreviewAttachment");
    });

    it("has compassPreviewAttachment function for image lightbox", () => {
      expect(compassJs).toContain("function compassPreviewAttachment(url, name)");
    });

    it("shows 'No attachments' when empty", () => {
      const renderSection = compassJs.slice(
        compassJs.indexOf("function compassRenderAttachmentsDetail"),
        compassJs.indexOf("function compassRenderAttachmentsDetail") + 1200
      );
      expect(renderSection).toContain("No attachments");
    });

    it("attachment detail is wired into compassOpenDetail", () => {
      expect(compassJs).toContain("compassRenderAttachmentsDetail(log)");
    });
  });

  // ---- Server-side Upload Endpoint ----
  describe("Server Upload Endpoint", () => {
    it("has POST /upload endpoint", () => {
      expect(ioRoutes).toContain('router.post("/upload"');
    });

    it("accepts folder parameter for S3 key prefix", () => {
      expect(ioRoutes).toContain("folder");
    });
  });

  // ---- Dispute Attachments (reference — should already work) ----
  describe("Dispute Attachments (reference)", () => {
    it("dispute flow uploads via fileToBase64 + /upload", () => {
      // The dispute submit section should have upload logic
      const disputeSection = compassJs.slice(
        compassJs.indexOf("// Upload attachments if any\n  let attachmentUrls"),
        compassJs.indexOf("// Upload attachments if any\n  let attachmentUrls") + 800
      );
      expect(disputeSection).toContain("fileToBase64");
      expect(disputeSection).toContain("IO_API_BASE}/upload");
    });

    it("dispute saves to dispute_attachments field", () => {
      expect(compassJs).toContain("update.dispute_attachments = JSON.stringify");
    });
  });

  // ---- Cache Version ----
  describe("Cache Version", () => {
    it("compass.js cache version is bumped to v122", () => {
      expect(indexHtml).toContain("compass.js?v=123");
    });
  });
});
