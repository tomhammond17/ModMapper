import { describe, it, expect, vi } from "vitest";
import express from "express";
import compression from "compression";
import request from "supertest";

describe("Response Compression", () => {
  it("should compress large JSON responses", async () => {
    const app = express();
    app.use(compression({ threshold: 100 })); // Lower threshold for testing
    
    // Create a route that returns a large JSON response
    app.get("/api/large", (req, res) => {
      const largeData = {
        registers: Array(100).fill(null).map((_, i) => ({
          address: i,
          name: `Register_${i}`,
          datatype: "UINT16",
          description: "This is a test description for the register",
          writable: i % 2 === 0,
        })),
      };
      res.json(largeData);
    });

    const response = await request(app)
      .get("/api/large")
      .set("Accept-Encoding", "gzip, deflate");

    expect(response.status).toBe(200);
    // Check that content-encoding header indicates compression
    expect(response.headers["content-encoding"]).toMatch(/gzip|deflate/);
    // The response should still be parseable
    expect(response.body.registers).toHaveLength(100);
  });

  it("should not compress small responses below threshold", async () => {
    const app = express();
    app.use(compression({ threshold: 10000 })); // High threshold
    
    app.get("/api/small", (req, res) => {
      res.json({ status: "ok" });
    });

    const response = await request(app)
      .get("/api/small")
      .set("Accept-Encoding", "gzip, deflate");

    expect(response.status).toBe(200);
    // Small responses should not have content-encoding
    expect(response.headers["content-encoding"]).toBeUndefined();
  });

  it("should not compress when client doesn't accept encoding", async () => {
    const app = express();
    app.use(compression({ threshold: 100 }));
    
    app.get("/api/test", (req, res) => {
      res.json({ data: "x".repeat(500) });
    });

    const response = await request(app)
      .get("/api/test");
      // Not setting Accept-Encoding header

    expect(response.status).toBe(200);
    // Response body should still be valid
    expect(response.body.data).toBeDefined();
  });

  it("should compress text/plain responses", async () => {
    const app = express();
    app.use(compression({ threshold: 100 }));
    
    app.get("/api/text", (req, res) => {
      res.type("text/plain").send("x".repeat(500));
    });

    const response = await request(app)
      .get("/api/text")
      .set("Accept-Encoding", "gzip, deflate");

    expect(response.status).toBe(200);
    expect(response.headers["content-encoding"]).toMatch(/gzip|deflate/);
  });

  it("should compress CSV responses", async () => {
    const app = express();
    app.use(compression({ threshold: 100 }));
    
    app.get("/api/csv", (req, res) => {
      const csvData = Array(50).fill("address,name,datatype,description,writable").join("\n");
      res.type("text/csv").send(csvData);
    });

    const response = await request(app)
      .get("/api/csv")
      .set("Accept-Encoding", "gzip, deflate");

    expect(response.status).toBe(200);
    expect(response.headers["content-encoding"]).toMatch(/gzip|deflate/);
  });
});

