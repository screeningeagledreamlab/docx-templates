import path from 'path';
import { zipLoad } from '../zip';
import {
  readContentTypes,
  getMainDoc,
  getMetadata,
  parseTemplate,
} from '../main';
import fs from 'fs';
import { setDebugLogSink } from '../debug';
import { findHighestImgId, cloneVal } from '../processTemplate';

if (process.env.DEBUG) setDebugLogSink(console.log);

describe('[Content_Types].xml parser', () => {
  it('Correctly finds the main document xml file in a regular .docx file', async () => {
    const template = await fs.promises.readFile(
      path.join(__dirname, 'fixtures', 'simpleQuery.docx')
    );
    const zip = await zipLoad(template);
    const content_types = await readContentTypes(zip);
    const main_doc = getMainDoc(content_types);
    expect(main_doc).toStrictEqual('document.xml');
  });
  it('Correctly finds the main document xml file in an Office365 .docx file', async () => {
    const template = await fs.promises.readFile(
      path.join(__dirname, 'fixtures', 'office365.docx')
    );
    const zip = await zipLoad(template);
    const content_types = await readContentTypes(zip);
    const main_doc = getMainDoc(content_types);
    expect(main_doc).toStrictEqual('document2.xml');
  });
});

describe('getMetadata', () => {
  it('finds the number of pages', async () => {
    const template = await fs.promises.readFile(
      path.join(__dirname, 'fixtures', 'simpleQuery.docx')
    );
    expect(await getMetadata(template)).toMatchInlineSnapshot(`
      {
        "category": undefined,
        "characters": 24,
        "company": undefined,
        "created": "2015-08-16T18:55:00Z",
        "creator": "Unga Graorg",
        "description": undefined,
        "lastModifiedBy": "Grau Panea, Guillermo",
        "lastPrinted": undefined,
        "lines": 1,
        "modified": "2016-12-15T11:21:00Z",
        "pages": 1,
        "paragraphs": 1,
        "revision": "32",
        "subject": undefined,
        "template": "Normal.dotm",
        "title": undefined,
        "words": 4,
      }
    `);
  });

  it('smoke test: does not crash on normal docx files', async () => {
    expect.hasAssertions();
    const files = await fs.promises.readdir(
      path.join(__dirname, 'fixtures'),
      'utf-8'
    );
    for (const f of files) {
      if (f.startsWith('~$') || !f.endsWith('.docx')) continue;
      const t = await fs.promises.readFile(path.join(__dirname, 'fixtures', f));
      const metadata = await getMetadata(t);
      expect(typeof metadata.modified).toBe('string');
    }
  });
});

describe('findHighestImgId', () => {
  it('returns 0 when doc contains no images', async () => {
    const template = await fs.promises.readFile(
      path.join(__dirname, 'fixtures', 'imageExistingMultiple.docx')
    );
    const { jsTemplate } = await parseTemplate(template);
    expect(findHighestImgId(jsTemplate)).toBe(3);
  });
});

describe('cloneVal', () => {
  it('clones a Map so mutations of the original are not visible', () => {
    const original = new Map<string, number>([['id', 0]]);
    const clone = cloneVal(original) as Map<string, number>;
    expect(clone).not.toBe(original);
    original.set('id', 2);
    expect(clone.get('id')).toBe(0);
  });

  it('deep-clones values stored inside a Map', () => {
    const inner = { index: 0 };
    const original = new Map([['config', inner]]);
    const clone = cloneVal(original) as Map<string, { index: number }>;
    inner.index = 2;
    expect(clone.get('config')!.index).toBe(0);
  });

  it('clones a Set so mutations of the original are not visible', () => {
    const original = new Set([1, 2]);
    const clone = cloneVal(original) as Set<number>;
    expect(clone).not.toBe(original);
    original.add(3);
    expect(clone.has(3)).toBe(false);
  });

  it('clones a Date so mutations of the original are not visible', () => {
    const original = new Date(1000);
    const clone = cloneVal(original) as Date;
    expect(clone).not.toBe(original);
    original.setTime(2000);
    expect(clone.getTime()).toBe(1000);
  });

  it('clones a Map created in another realm (vm sandbox)', () => {
    // Maps created inside the vm sandbox have a different Map constructor,
    // so instanceof checks would miss them
    const vm = require('vm');
    const original = vm.runInNewContext("new Map([['id', 0]])") as Map<
      string,
      number
    >;
    const clone = cloneVal(original) as Map<string, number>;
    expect(clone).not.toBe(original);
    original.set('id', 2);
    expect(clone.get('id')).toBe(0);
  });

  it('handles circular references through Maps', () => {
    const original = new Map<string, unknown>();
    original.set('self', original);
    const clone = cloneVal(original) as Map<string, unknown>;
    expect(clone).not.toBe(original);
    expect(clone.get('self')).toBe(clone);
  });

  it('returns functions, Buffers and class instances by reference', () => {
    const fn = () => 42;
    const buf = Buffer.from('img');
    class Handle {
      value = 1;
    }
    const instance = new Handle();
    expect(cloneVal(fn)).toBe(fn);
    expect(cloneVal(buf)).toBe(buf);
    expect(cloneVal(instance)).toBe(instance);
  });
});
