const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const Datastore = require('@seald-io/nedb');
const multer = require('multer');

const app = express();
const port = process.env.PORT || 3001;
const dataDir = path.join(__dirname, 'data');
const uploadsDir = path.join(dataDir, 'uploads');

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({ storage: multer.memoryStorage(), limits: { files: 10, fileSize: 10 * 1024 * 1024 } });

const db = new Datastore({
  filename: path.join(dataDir, 'forms.db'),
  autoload: true,
});

db.ensureIndex({ fieldName: 'f_payee' });
db.ensureIndex({ fieldName: 'updatedAt' });

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.use((err, _req, res, next) => {
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ message: 'Invalid JSON payload.' });
    return;
  }
  next(err);
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/forms', (req, res) => {
  const payload = { ...(req.body || {}) };
  const now = new Date().toISOString();

  delete payload._id;
  delete payload.createdAt;
  delete payload.updatedAt;

  const doc = {
    ...payload,
    f_payee: typeof payload.f_payee === 'string' ? payload.f_payee.trim() : '',
    createdAt: now,
    updatedAt: now,
  };

  db.insert(doc, (err, newDoc) => {
    if (err) {
      console.error('Save form failed:', err);
      res.status(500).json({ message: 'Failed to save form data.' });
      return;
    }
    res.status(201).json(newDoc);
  });
});

app.post('/api/forms/:id/attachments', upload.array('files', 10), (req, res) => {
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ message: 'Record id is required.' });
    return;
  }

  const files = Array.isArray(req.files) ? req.files : [];
  if (!files.length) {
    res.status(400).json({ message: 'No files were uploaded.' });
    return;
  }

  db.findOne({ _id: id }, (findErr, doc) => {
    if (findErr) {
      res.status(500).json({ message: 'Failed to find record.' });
      return;
    }

    if (!doc) {
      res.status(404).json({ message: 'Record not found.' });
      return;
    }

    const requestNumber = sanitizeRequestNumber((req.body && req.body.requestNumber) || doc.f_reqno || id);
    const requestDir = path.join(uploadsDir, requestNumber);
    fs.mkdirSync(requestDir, { recursive: true });

    const existingAttachments = Array.isArray(doc.attachments) ? doc.attachments : [];
    const now = new Date().toISOString();

    const newAttachments = files.map((file) => {
      const attachmentId = createAttachmentId();
      const storedName = `${attachmentId}-${sanitizeFileName(file.originalname)}`;
      const filePath = path.join(requestDir, storedName);

      fs.writeFileSync(filePath, file.buffer);

      return {
        id: attachmentId,
        originalName: file.originalname,
        storedName,
        mimeType: file.mimetype || 'application/octet-stream',
        size: file.size,
        uploadedAt: now,
      };
    });

    const attachments = [...existingAttachments, ...newAttachments];

    db.update(
      { _id: id },
      { $set: { attachments, f_reqno: doc.f_reqno || requestNumber, updatedAt: now } },
      {},
      (updateErr) => {
        if (updateErr) {
          res.status(500).json({ message: 'Failed to save attachment metadata.' });
          return;
        }
        res.json({ attachments });
      },
    );
  });
});

app.get('/api/forms/:id/attachments/:attachmentId/download', (req, res) => {
  const id = req.params.id;
  const attachmentId = req.params.attachmentId;

  if (!id || !attachmentId) {
    res.status(400).json({ message: 'Record id and attachment id are required.' });
    return;
  }

  db.findOne({ _id: id }, (findErr, doc) => {
    if (findErr) {
      res.status(500).json({ message: 'Failed to find record.' });
      return;
    }

    if (!doc) {
      res.status(404).json({ message: 'Record not found.' });
      return;
    }

    const requestNumber = sanitizeRequestNumber(doc.f_reqno || id);
    const attachments = Array.isArray(doc.attachments) ? doc.attachments : [];
    const attachment = attachments.find((item) => item && item.id === attachmentId);

    if (!attachment) {
      res.status(404).json({ message: 'Attachment not found.' });
      return;
    }

    const filePath = path.join(uploadsDir, requestNumber, attachment.storedName);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ message: 'Attachment file is missing.' });
      return;
    }

    res.download(filePath, attachment.originalName);
  });
});

app.put('/api/forms/:id', (req, res) => {
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ message: 'Record id is required.' });
    return;
  }

  const payload = { ...(req.body || {}) };
  delete payload._id;
  delete payload.createdAt;
  delete payload.updatedAt;

  const doc = {
    ...payload,
    f_payee: typeof payload.f_payee === 'string' ? payload.f_payee.trim() : '',
    updatedAt: new Date().toISOString(),
  };

  db.update({ _id: id }, { $set: doc }, {}, (err, numReplaced) => {
    if (err) {
      console.error('Update form failed:', err);
      res.status(500).json({ message: 'Failed to update form data.' });
      return;
    }

    if (!numReplaced) {
      res.status(404).json({ message: 'Record not found.' });
      return;
    }

    db.findOne({ _id: id }, (findErr, updatedDoc) => {
      if (findErr || !updatedDoc) {
        res.status(500).json({ message: 'Form updated, but failed to reload record.' });
        return;
      }
      res.json(updatedDoc);
    });
  });
});

app.get('/api/forms/list', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const sortBy = typeof req.query.sortBy === 'string' ? req.query.sortBy : 'updatedAt';
  const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

  const rawPayee = typeof req.query.payee === 'string' ? req.query.payee.trim() : '';
  const filter = rawPayee
    ? { f_payee: new RegExp(rawPayee.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }
    : {};

  db.find(filter).exec((err, allDocs) => {
    if (err) {
      res.status(500).json({ message: 'Failed to list forms.' });
      return;
    }

    const sortedDocs = [...allDocs].sort((leftDoc, rightDoc) => compareRecords(leftDoc, rightDoc, sortBy, sortOrder));
    const paginatedDocs = sortedDocs.slice(skip, skip + limit);

    res.json({ docs: paginatedDocs, count: allDocs.length });
  });
});

app.get('/api/forms/count', (_req, res) => {
  db.count({}, (err, count) => {
    if (err) {
      res.status(500).json({ message: 'Failed to count forms.' });
      return;
    }
    res.json({ count });
  });
});

app.get('/api/forms/search', (req, res) => {
  const rawPayee = typeof req.query.payee === 'string' ? req.query.payee.trim() : '';
  const filter = rawPayee
    ? { f_payee: new RegExp(rawPayee.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }
    : {};

  db.find(filter)
    .sort({ updatedAt: -1 })
    .limit(25)
    .exec((err, docs) => {
      if (err) {
        res.status(500).json({ message: 'Failed to search payees.' });
        return;
      }
      res.json(docs);
    });
});

app.delete('/api/forms/:id', (req, res) => {
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ message: 'Record id is required.' });
    return;
  }

  db.findOne({ _id: id }, (findErr, doc) => {
    if (findErr) {
      res.status(500).json({ message: 'Failed to find record.' });
      return;
    }

    db.remove({ _id: id }, {}, (err, numRemoved) => {
    if (err) {
      console.error('Delete form failed:', err);
      res.status(500).json({ message: 'Failed to delete form data.' });
      return;
    }

    if (!numRemoved) {
      res.status(404).json({ message: 'Record not found.' });
      return;
    }

    if (doc && doc.f_reqno) {
      const requestDir = path.join(uploadsDir, sanitizeRequestNumber(doc.f_reqno));
      if (fs.existsSync(requestDir)) {
        fs.rmSync(requestDir, { recursive: true, force: true });
      }
    }

    res.json({ deleted: true });
    });
  });
});

function sanitizeRequestNumber(value) {
  const normalized = String(value || '').trim();
  return normalized.replace(/[^a-zA-Z0-9_-]/g, '_') || 'unknown';
}

function sanitizeFileName(value) {
  return String(value || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
}

function createAttachmentId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function compareRecords(leftDoc, rightDoc, sortBy, sortOrder) {
  const leftValue = getSortValue(leftDoc, sortBy);
  const rightValue = getSortValue(rightDoc, sortBy);

  if (leftValue < rightValue) {
    return -1 * sortOrder;
  }

  if (leftValue > rightValue) {
    return 1 * sortOrder;
  }

  return 0;
}

function getSortValue(doc, sortBy) {
  if (sortBy === 'total_expenses' || sortBy === 'amount_due') {
    return Number(doc?.[sortBy]) || 0;
  }

  if (sortBy === 'updatedAt') {
    return Date.parse(doc?.updatedAt || '') || 0;
  }

  const raw = doc?.[sortBy];
  if (raw === undefined || raw === null) {
    return '';
  }

  return String(raw).toLowerCase();
}

const frontendDir = path.join(__dirname, 'public');
if (fs.existsSync(frontendDir)) {
  app.use(express.static(frontendDir));

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) {
      next();
      return;
    }
    res.sendFile(path.join(frontendDir, 'index.html'));
  });
}

app.listen(port, () => {
  console.log(`Node API running on http://localhost:${port}`);
});
