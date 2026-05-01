const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const Datastore = require('@seald-io/nedb');

const app = express();
const port = process.env.PORT || 3001;
const dataDir = path.join(__dirname, 'data');

fs.mkdirSync(dataDir, { recursive: true });

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

    res.json({ deleted: true });
  });
});

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
