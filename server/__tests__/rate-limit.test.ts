import { describe, it, expect, beforeEach, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import { generalLimiter, pdfParseLimiter, fileParseLimiter, documentLimiter } from "../rate-limit";

// Helper to create a test app with a rate-limited endpoint
function createTestApp(limiter: ReturnType<typeof generalLimiter>) {
  const app = express();
  app.use(express.json());
  
  app.get("/test", limiter, (req, res) => {
    res.json({ success: true, message: "OK" });
  });
  
  return app;
}

describe("Rate Limiting", () => {
  describe("generalLimiter", () => {
    it("should allow requests under the limit", async () => {
      const app = createTestApp(generalLimiter);
      
      const response = await request(app).get("/test");
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it("should include rate limit headers in response", async () => {
      const app = createTestApp(generalLimiter);
      
      const response = await request(app).get("/test");
      
      expect(response.headers["ratelimit-limit"]).toBeDefined();
      expect(response.headers["ratelimit-remaining"]).toBeDefined();
    });
  });

  describe("pdfParseLimiter", () => {
    it("should allow requests under the limit", async () => {
      const app = createTestApp(pdfParseLimiter);
      
      const response = await request(app).get("/test");
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it("should have a lower limit than general limiter (10 vs 100)", async () => {
      const app = createTestApp(pdfParseLimiter);
      
      const response = await request(app).get("/test");
      
      // PDF limiter allows 10 requests per window
      expect(response.headers["ratelimit-limit"]).toBe("10");
    });

    it("should return proper error message when limit exceeded", async () => {
      const app = createTestApp(pdfParseLimiter);
      
      // Make 11 requests to exceed the limit of 10
      for (let i = 0; i < 10; i++) {
        await request(app).get("/test");
      }
      
      const response = await request(app).get("/test");
      
      expect(response.status).toBe(429);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain("Too many PDF parsing requests");
    });
  });

  describe("fileParseLimiter", () => {
    it("should allow requests under the limit", async () => {
      const app = createTestApp(fileParseLimiter);
      
      const response = await request(app).get("/test");
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it("should have a limit of 30 requests", async () => {
      const app = createTestApp(fileParseLimiter);
      
      const response = await request(app).get("/test");
      
      expect(response.headers["ratelimit-limit"]).toBe("30");
    });
  });

  describe("documentLimiter", () => {
    it("should allow requests under the limit", async () => {
      const app = createTestApp(documentLimiter);
      
      const response = await request(app).get("/test");
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it("should have a higher limit for document operations (200)", async () => {
      const app = createTestApp(documentLimiter);
      
      const response = await request(app).get("/test");
      
      expect(response.headers["ratelimit-limit"]).toBe("200");
    });
  });

  describe("Rate limit hierarchy", () => {
    it("should have progressively stricter limits: PDF < file < document", async () => {
      const pdfApp = createTestApp(pdfParseLimiter);
      const fileApp = createTestApp(fileParseLimiter);
      const docApp = createTestApp(documentLimiter);
      
      const pdfResponse = await request(pdfApp).get("/test");
      const fileResponse = await request(fileApp).get("/test");
      const docResponse = await request(docApp).get("/test");
      
      const pdfLimit = parseInt(pdfResponse.headers["ratelimit-limit"], 10);
      const fileLimit = parseInt(fileResponse.headers["ratelimit-limit"], 10);
      const docLimit = parseInt(docResponse.headers["ratelimit-limit"], 10);
      
      // PDF (10) < File (30) < Document (200)
      expect(pdfLimit).toBeLessThan(fileLimit);
      expect(fileLimit).toBeLessThan(docLimit);
    });
  });
});

