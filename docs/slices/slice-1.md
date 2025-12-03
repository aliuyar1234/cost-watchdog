# Slice 1: Foundation + Document → Cost

> **Wochen:** 1-4  
> **Ziel:** "PDF hochladen → Kosten extrahiert → gespeichert"

## Deliverable

Am Ende von Slice 1:
- Ein User kann sich einloggen
- Ein User kann ein PDF hochladen
- Das System extrahiert Kostendaten (Template oder LLM)
- Die Kostendaten werden gespeichert und angezeigt
- Alles ist Multi-Tenant-ready mit RLS

## Aufgaben

### Woche 1: Monorepo + Database + Auth

**1.1 Monorepo Setup**
```bash
# Turborepo initialisieren
npx create-turbo@latest cost-watchdog
cd cost-watchdog

# Struktur anpassen
apps/
  web/          # Next.js 14
  api/          # Fastify
packages/
  core/         # Shared Types, Business Logic
  connector-sdk/ # Connector Interface
  connectors/   # PDF, Excel Connectors
  ui/           # Shared Components
```

**1.2 Prisma + PostgreSQL + RLS**

```prisma
// apps/api/prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Tenant {
  id        String   @id @default(uuid())
  name      String
  plan      String   @default("starter")
  settings  Json     @default("{}")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  users       User[]
  documents   Document[]
  costRecords CostRecord[]
}

model User {
  id        String   @id @default(uuid())
  tenantId  String
  email     String
  name      String?
  role      String   @default("viewer")
  createdAt DateTime @default(now())
  
  tenant    Tenant   @relation(fields: [tenantId], references: [id])
  
  @@unique([tenantId, email])
  @@index([tenantId])
}

model Document {
  id               String   @id @default(uuid())
  tenantId         String
  originalFilename String
  fileHash         String
  storagePath      String
  mimeType         String
  fileSize         Int
  extractionStatus String   @default("pending")
  extractionAudit  Json?
  uploadedAt       DateTime @default(now())
  
  tenant      Tenant       @relation(fields: [tenantId], references: [id])
  costRecords CostRecord[]
  
  @@unique([tenantId, fileHash])
  @@index([tenantId, extractionStatus])
}

model CostRecord {
  id            String   @id @default(uuid())
  tenantId      String
  documentId    String?
  
  // Zeitraum
  periodStart   DateTime
  periodEnd     DateTime
  invoiceDate   DateTime?
  
  // Kosten
  amount        Decimal  @db.Decimal(18, 4)
  currency      String   @default("EUR")
  amountNet     Decimal? @db.Decimal(18, 4)
  vatAmount     Decimal? @db.Decimal(18, 4)
  
  // Verbrauch
  quantity      Decimal? @db.Decimal(18, 4)
  unit          String?
  pricePerUnit  Decimal? @db.Decimal(18, 6)
  
  // Klassifikation
  costType      String
  supplierName  String
  supplierId    String?
  
  // Metadaten
  confidence    Float    @default(0)
  isVerified    Boolean  @default(false)
  extractionMethod String @default("manual")
  
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  
  tenant   Tenant    @relation(fields: [tenantId], references: [id])
  document Document? @relation(fields: [documentId], references: [id])
  
  @@index([tenantId, periodStart])
  @@index([tenantId, costType])
  @@index([tenantId, supplierId])
}
```

**RLS Setup (Migration):**

```sql
-- migrations/YYYYMMDD_rls_setup.sql

-- Enable RLS on all tenant tables
ALTER TABLE "Tenant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Document" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CostRecord" ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY tenant_isolation_user ON "User"
  FOR ALL USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

CREATE POLICY tenant_isolation_document ON "Document"
  FOR ALL USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

CREATE POLICY tenant_isolation_cost_record ON "CostRecord"
  FOR ALL USING (tenant_id = current_setting('app.current_tenant', true)::uuid);
```

**1.3 Basic Auth (Better-Auth)**

```typescript
// apps/api/src/lib/auth.ts
import { betterAuth } from 'better-auth';
import { prisma } from './db';

export const auth = betterAuth({
  database: prisma,
  emailAndPassword: {
    enabled: true,
  },
});
```

### Woche 2: Document Upload + Storage

**2.1 File Upload API**

```typescript
// apps/api/src/routes/documents.ts
import { FastifyPluginAsync } from 'fastify';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'crypto';

export const documentsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/upload', async (request, reply) => {
    const { tenantId } = request.user;
    const file = await request.file();
    
    // Hash für Deduplizierung
    const fileBuffer = await file.toBuffer();
    const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    
    // Prüfe Duplikat
    const existing = await withTenant(tenantId, (tx) =>
      tx.document.findUnique({
        where: { tenantId_fileHash: { tenantId, fileHash } }
      })
    );
    
    if (existing) {
      return reply.status(409).send({ error: 'Document already exists', documentId: existing.id });
    }
    
    // Upload zu S3
    const storagePath = `tenants/${tenantId}/documents/${crypto.randomUUID()}.pdf`;
    await s3.send(new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: storagePath,
      Body: fileBuffer,
      ContentType: file.mimetype,
    }));
    
    // Document + Outbox Event in einer Transaction
    const document = await withTenant(tenantId, async (tx) => {
      const doc = await tx.document.create({
        data: {
          tenantId,
          originalFilename: file.filename,
          fileHash,
          storagePath,
          mimeType: file.mimetype,
          fileSize: fileBuffer.length,
          extractionStatus: 'pending',
        },
      });
      
      // Outbox Event
      await tx.outboxEvent.create({
        data: {
          tenantId,
          aggregateType: 'document',
          aggregateId: doc.id,
          eventType: 'document.uploaded',
          payload: { documentId: doc.id },
        },
      });
      
      return doc;
    });
    
    return { documentId: document.id, status: 'pending' };
  });
};
```

**2.2 Outbox Table**

```prisma
model OutboxEvent {
  id            BigInt   @id @default(autoincrement())
  tenantId      String
  aggregateType String
  aggregateId   String
  eventType     String
  payload       Json
  createdAt     DateTime @default(now())
  processedAt   DateTime?
  attempts      Int      @default(0)
  nextAttemptAt DateTime @default(now())
  errorMessage  String?
  
  @@index([processedAt, nextAttemptAt])
}
```

### Woche 3: PDF Extraction

**3.1 Extraction Worker**

```typescript
// apps/api/src/workers/extraction.worker.ts
import { Worker } from 'bullmq';
import { extractFromPdf } from '@cost-watchdog/connectors';

const extractionWorker = new Worker('extraction', async (job) => {
  const { tenantId, documentId } = job.data;
  
  // 1. Document laden
  const document = await withTenant(tenantId, (tx) =>
    tx.document.findUnique({ where: { id: documentId } })
  );
  
  if (!document) return;
  
  // 2. Status auf processing
  await withTenant(tenantId, (tx) =>
    tx.document.update({
      where: { id: documentId },
      data: { extractionStatus: 'processing' },
    })
  );
  
  try {
    // 3. PDF aus S3 laden
    const pdfBuffer = await downloadFromS3(document.storagePath);
    
    // 4. Extraktion (Template oder LLM)
    const result = await extractFromPdf(pdfBuffer);
    
    // 5. Ergebnis speichern
    await withTenant(tenantId, async (tx) => {
      // Document updaten
      await tx.document.update({
        where: { id: documentId },
        data: {
          extractionStatus: 'completed',
          extractionAudit: result.audit,
        },
      });
      
      // CostRecords erstellen
      for (const record of result.records) {
        const created = await tx.costRecord.create({
          data: {
            tenantId,
            documentId,
            ...record,
          },
        });
        
        // Outbox für Anomaly Detection (Slice 2)
        await tx.outboxEvent.create({
          data: {
            tenantId,
            aggregateType: 'cost_record',
            aggregateId: created.id,
            eventType: 'cost_record.created',
            payload: { costRecordId: created.id },
          },
        });
      }
    });
  } catch (error) {
    await withTenant(tenantId, (tx) =>
      tx.document.update({
        where: { id: documentId },
        data: {
          extractionStatus: 'failed',
          extractionAudit: { error: error.message },
        },
      })
    );
    throw error;
  }
}, { connection: redis });
```

**3.2 PDF Connector (Template + LLM)**

```typescript
// packages/connectors/src/pdf/extract.ts
import { extractText } from './text-extractor';
import { detectSupplier, getTemplate } from './templates';
import { extractWithLLM } from './llm-extractor';

export async function extractFromPdf(buffer: Buffer): Promise<ExtractionResult> {
  // 1. Text extrahieren
  const text = await extractText(buffer);
  
  // 2. Lieferant erkennen
  const supplier = detectSupplier(text);
  
  // 3. Template oder LLM
  if (supplier && getTemplate(supplier.id)) {
    // Template-basierte Extraktion (schnell, deterministisch)
    const template = getTemplate(supplier.id);
    const records = template.parse(text);
    
    return {
      success: true,
      records,
      audit: {
        method: 'template',
        templateId: supplier.id,
        confidence: 0.95,
      },
    };
  } else {
    // LLM Fallback
    return extractWithLLM(text);
  }
}
```

**3.3 Beispiel Template Parser (Wien Energie)**

```typescript
// packages/connectors/src/pdf/templates/wien-energie.ts
export const wienEnergieParser: TemplateParser = {
  id: 'wien_energie',
  patterns: ['Wien Energie', 'ATU16346809'],
  
  parse(text: string): CostRecord[] {
    const invoice = {
      invoiceNumber: text.match(/Rechnungsnummer:\s*(\d+)/)?.[1],
      invoiceDate: parseDate(text.match(/Rechnungsdatum:\s*(\d{2}\.\d{2}\.\d{4})/)?.[1]),
      periodStart: parseDate(text.match(/Abrechnungszeitraum:\s*(\d{2}\.\d{2}\.\d{4})/)?.[1]),
      periodEnd: parseDate(text.match(/bis\s*(\d{2}\.\d{2}\.\d{4})/)?.[1]),
      amount: parseNumber(text.match(/Rechnungsbetrag:\s*EUR\s*([\d.,]+)/)?.[1]),
      quantity: parseNumber(text.match(/Verbrauch:\s*([\d.,]+)\s*kWh/)?.[1]),
      meterNumber: text.match(/Zählpunkt:\s*(\w+)/)?.[1],
    };
    
    return [{
      ...invoice,
      costType: 'electricity',
      unit: 'kWh',
      pricePerUnit: invoice.quantity ? invoice.amount / invoice.quantity : undefined,
      supplierName: 'Wien Energie',
      confidence: 0.95,
      extractionMethod: 'template',
    }];
  },
};
```

### Woche 4: Frontend + Basic UI

**4.1 Dashboard Page**

```typescript
// apps/web/app/dashboard/page.tsx
import { getCostRecords } from '@/lib/api';

export default async function DashboardPage() {
  const records = await getCostRecords();
  
  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Cost Watchdog</h1>
      
      <div className="grid grid-cols-3 gap-4 mb-8">
        <KPICard 
          title="Gesamtkosten (YTD)" 
          value={formatCurrency(records.reduce((sum, r) => sum + r.amount, 0))} 
        />
        <KPICard title="Dokumente" value={records.length} />
        <KPICard title="Anomalien" value={0} /> {/* Slice 2 */}
      </div>
      
      <DocumentUpload />
      
      <CostRecordsTable records={records} />
    </div>
  );
}
```

**4.2 Document Upload Component**

```typescript
// apps/web/components/document-upload.tsx
'use client';

import { useState } from 'react';
import { useDropzone } from 'react-dropzone';

export function DocumentUpload() {
  const [uploading, setUploading] = useState(false);
  
  const { getRootProps, getInputProps } = useDropzone({
    accept: { 'application/pdf': ['.pdf'] },
    onDrop: async (files) => {
      setUploading(true);
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        await fetch('/api/documents/upload', {
          method: 'POST',
          body: formData,
        });
      }
      setUploading(false);
    },
  });
  
  return (
    <div {...getRootProps()} className="border-2 border-dashed p-8 text-center cursor-pointer">
      <input {...getInputProps()} />
      {uploading ? 'Uploading...' : 'PDF hier ablegen oder klicken'}
    </div>
  );
}
```

## Definition of Done

- [ ] Monorepo läuft (`turbo dev`)
- [ ] User kann sich registrieren/einloggen
- [ ] User kann PDF hochladen
- [ ] PDF wird extrahiert (mindestens Wien Energie Template funktioniert)
- [ ] CostRecords werden in DB gespeichert
- [ ] CostRecords werden in UI angezeigt
- [ ] RLS Tests bestehen (Tenant A sieht nicht Tenant B)
- [ ] Outbox Events werden geschrieben

## Tests

```typescript
// Slice 1 muss diese Tests bestehen:

describe('RLS Tenant Isolation', () => {
  test('Tenant A cannot see Tenant B documents', async () => {
    // Setup: Create doc in Tenant B
    await withTenant(tenantB, (tx) => tx.document.create({ data: docB }));
    
    // Test: Query from Tenant A
    const docs = await withTenant(tenantA, (tx) => tx.document.findMany());
    
    // Assert: No Tenant B docs
    expect(docs.every(d => d.tenantId === tenantA)).toBe(true);
  });
});

describe('PDF Extraction', () => {
  test('Wien Energie template extracts correctly', async () => {
    const result = await extractFromPdf(wienEnergieSamplePdf);
    
    expect(result.records[0].costType).toBe('electricity');
    expect(result.records[0].amount).toBeGreaterThan(0);
    expect(result.records[0].quantity).toBeGreaterThan(0);
  });
});
```
