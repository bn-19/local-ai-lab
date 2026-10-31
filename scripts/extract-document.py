"""Trusted text extraction only. Never evaluates uploaded code or macros."""
import sys, json, zipfile, xml.etree.ElementTree as ET
MAX = 24000

def xml(data):
    if b'<!DOCTYPE' in data or b'<!ENTITY' in data:
        raise ValueError('XML declarations with entities are unsupported')
    return ET.fromstring(data)

def extract(file, kind):
    if kind == '.pdf':
        try:
            from pypdf import PdfReader
        except ImportError:
            raise ValueError('PDF reader missing: install pypdf in the companion Python environment')
        reader = PdfReader(file)
        if reader.is_encrypted:
            raise ValueError('Password-protected PDFs are unsupported')
        if len(reader.pages) > 100:
            raise ValueError('PDF limit is 100 pages')
        parts=[]
        for i, page in enumerate(reader.pages):
            parts.append(f'Page {i+1}\n'+(page.extract_text() or ''))
            if sum(map(len,parts)) > MAX:
                raise ValueError('Extracted text exceeds 24,000 characters; split the document')
        if not any((p.extract_text() or '').strip() for p in reader.pages):
            raise ValueError('No readable text: scanned PDFs require OCR')
        return '\n\n'.join(parts)
    with zipfile.ZipFile(file) as archive:
        entries=archive.infolist()
        if len(entries)>1000 or sum(x.file_size for x in entries)>20*1024*1024:
            raise ValueError('Document archive exceeds extraction limits')
        def read(name):
            item=archive.getinfo(name)
            if item.file_size>5*1024*1024: raise ValueError('Document section too large')
            return xml(archive.read(name))
        if kind == '.docx':
            root=read('word/document.xml')
            return '\n'.join(''.join(n.itertext()) for n in root.iter() if n.tag.endswith('}t'))
        ns={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
        strings=[]
        if 'xl/sharedStrings.xml' in archive.namelist():
            strings=[''.join(n.itertext()) for n in read('xl/sharedStrings.xml').findall('s:si',ns)]
        parts=[]
        for name in sorted(archive.namelist()):
            if not (name.startswith('xl/worksheets/sheet') and name.endswith('.xml')): continue
            parts.append(name)
            for row in read(name).findall('.//s:row',ns):
                values=[]
                for cell in row.findall('s:c',ns):
                    value=cell.findtext('s:v','',ns)
                    if cell.get('t')=='s': value=strings[int(value)]
                    elif cell.get('t')=='inlineStr': value=''.join(cell.find('s:is',ns).itertext())
                    if cell.find('s:f',ns) is not None: value='[formula; cached value] '+value
                    values.append(cell.get('r','')+': '+value)
                parts.append(' | '.join(values))
                if sum(map(len,parts))>MAX: raise ValueError('Extracted text exceeds 24,000 characters; split the workbook')
        return '\n'.join(parts)
try:
    text=extract(sys.argv[1],sys.argv[2])
    if not text.strip(): raise ValueError('No readable text in this file')
    if len(text)>MAX: raise ValueError('Extracted text exceeds 24,000 characters; split the document')
    print(json.dumps({'text':text}))
except Exception as error:
    print(json.dumps({'error':str(error)}))
    sys.exit(1)
