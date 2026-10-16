import os
import sys
import json
import re
import unicodedata
import extract_msg
from concurrent.futures import ThreadPoolExecutor, as_completed

try:
    import pypdf
except ImportError:
    pypdf = None

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

def normalize_key(s):
    if not s:
        return ''
    s = str(s).strip()
    s = unicodedata.normalize('NFD', s)
    s = re.sub(r'[\u0300-\u036f]', '', s)
    s = s.lower()
    s = re.sub(r'[^a-z0-9]+', ' ', s)
    return ' '.join(s.split())

def extract_pdf_text(pdf_path, max_pages=3):
    if not pypdf or not os.path.exists(pdf_path):
        return ''
    try:
        reader = pypdf.PdfReader(pdf_path)
        text_parts = []
        for i, page in enumerate(reader.pages[:max_pages]):
            t = page.extract_text()
            if t:
                text_parts.append(t)
        return '\n'.join(text_parts).strip()
    except Exception:
        return ''

def parse_msg_file(msg_path, folder_path=None):
    if not os.path.exists(msg_path):
        return None
    try:
        msg = extract_msg.Message(msg_path)
        subject = str(msg.subject or '').strip()
        sender = str(msg.sender or '').strip()
        to_recipients = str(msg.to or '').strip()
        cc_recipients = str(msg.cc or '').strip()
        bcc_recipients = str(msg.bcc or '').strip() if hasattr(msg, 'bcc') and msg.bcc else ''
        date_str = str(msg.date or '').strip()
        body = str(msg.body or '').strip()

        attachments = []
        nested_messages = []
        is_encrypted = False

        try:
            for att in getattr(msg, 'attachments', []):
                att_name = att.longFilename or att.shortFilename or 'attachment'
                att_type = getattr(att, 'mimetype', '') or os.path.splitext(att_name)[1].lower()
                is_att_msg = False
                att_data = getattr(att, 'data', None)

                if 'rpmsg' in att_name.lower():
                    is_encrypted = True

                if getattr(att, 'type', None) == 1 or att_name.lower().endswith('.msg') or hasattr(att_data, 'subject'):
                    is_att_msg = True
                    try:
                        n_msg = att_data
                        if n_msg and hasattr(n_msg, 'subject'):
                            nested_info = {
                                'subject': str(getattr(n_msg, 'subject', '') or ''),
                                'sender': str(getattr(n_msg, 'sender', '') or ''),
                                'to': str(getattr(n_msg, 'to', '') or ''),
                                'cc': str(getattr(n_msg, 'cc', '') or ''),
                                'date': str(getattr(n_msg, 'date', '') or ''),
                                'body': str(getattr(n_msg, 'body', '') or '')[:30000],
                                'attachments': [
                                    (a.longFilename or a.shortFilename or 'att')
                                    for a in getattr(n_msg, 'attachments', [])
                                ][:10]
                            }
                            nested_messages.append(nested_info)
                    except Exception:
                        pass

                att_size = len(att_data) if (att_data and isinstance(att_data, (bytes, bytearray, str))) else 0
                attachments.append({
                    'name': att_name,
                    'size': att_size,
                    'type': att_type,
                    'is_msg': is_att_msg
                })
        except Exception:
            pass

        if 'has sent you a protected message' in body.lower():
            is_encrypted = True

        pdf_transcript = ''
        if is_encrypted and folder_path and os.path.exists(folder_path):
            base_no_ext = os.path.splitext(os.path.basename(msg_path))[0].lower()
            prefix_match = re.search(r'^\d{6}', base_no_ext)
            prefix = prefix_match.group(0) if prefix_match else ''
            try:
                candidates = [f for f in os.listdir(folder_path) if f.lower().endswith('.pdf')]
                for c in candidates:
                    c_low = c.lower()
                    if prefix and prefix in c_low:
                        c_path = os.path.join(folder_path, c)
                        if os.path.getsize(c_path) < 3 * 1024 * 1024:
                            pdf_t = extract_pdf_text(c_path, max_pages=3)
                            if pdf_t:
                                pdf_transcript = pdf_t
                                break
            except Exception:
                pass

        if pdf_transcript:
            body = f"[NỘI DUNG THƯ TRÍCH XUẤT TỪ BẢN IN KÈM THEO]\n\n{pdf_transcript}\n\n---\n[THÔNG BÁO BẢO MẬT GỐC]:\n{body}"

        return {
            'subject': subject,
            'sender': sender,
            'to': to_recipients,
            'cc': cc_recipients,
            'bcc': bcc_recipients,
            'date': date_str,
            'body': body,
            'attachments': attachments,
            'nested_messages': nested_messages,
            'is_encrypted': is_encrypted,
            'file_name': os.path.basename(msg_path)
        }
    except Exception:
        return None

def main():
    workspace_json = r'c:\Users\Lines\Desktop\anti\work\Phần mềm tự tạo word PH HSMT\vercel-app\api\data\menu_workspace.json'
    output_json = r'c:\Users\Lines\Desktop\anti\work\Phần mềm tự tạo word PH HSMT\vercel-app\api\data\msg_store.json'

    store = {}
    print("Starting clean build of msg_store.json (compact)...", flush=True)

    print("Collecting files from menu_workspace.json...", flush=True)
    with open(workspace_json, 'r', encoding='utf-8') as f:
        ws_data = json.load(f)

    target_tasks = []
    
    def collect(obj):
        if isinstance(obj, dict):
            ten = str(obj.get('ten_tai_lieu', ''))
            folder = str(obj.get('folder', '') or obj.get('path', ''))
            noi_dung = str(obj.get('noi_dung', ''))
            if '.msg' in ten.lower() and folder:
                for line in ten.splitlines():
                    if '.msg' in line.lower():
                        fn = line.strip().lstrip('-*• ').strip()
                        fp = os.path.join(folder, fn)
                        target_tasks.append((fn, fp, folder, noi_dung))
            for v in obj.values():
                collect(v)
        elif isinstance(obj, list):
            for it in obj:
                collect(it)

    collect(ws_data)
    print(f"Total .msg references found in workspace: {len(target_tasks)}", flush=True)

    unique_map = {}
    for fn, fp, fld, nd in target_tasks:
        if fp not in unique_map:
            unique_map[fp] = {'fn': fn, 'fp': fp, 'folder': fld, 'noi_dung_list': []}
        if nd and nd not in unique_map[fp]['noi_dung_list']:
            unique_map[fp]['noi_dung_list'].append(nd)

    tasks_to_run = [v for v in unique_map.values() if os.path.exists(v['fp'])]
    print(f"Unique files existing on disk: {len(tasks_to_run)}", flush=True)

    def process_item(item):
        fp = item['fp']
        fld = item['folder']
        data = parse_msg_file(fp, fld)
        return (item, data)

    count = 0
    saved_count = 0
    with ThreadPoolExecutor(max_workers=16) as executor:
        future_to_item = {executor.submit(process_item, item): item for item in tasks_to_run}
        for future in as_completed(future_to_item):
            try:
                item, data = future.result()
                if data:
                    fn = item['fn']
                    clean_name = os.path.basename(fn).strip()
                    no_ext = os.path.splitext(clean_name)[0].strip()
                    norm_name = normalize_key(no_ext)

                    store[clean_name] = data
                    store[no_ext] = data
                    if norm_name:
                        store[norm_name] = data

                    for nd in item['noi_dung_list']:
                        if nd:
                            store[nd.strip()] = data
                            norm_nd = normalize_key(nd)
                            if norm_nd:
                                store[norm_nd] = data

                    saved_count += 1
            except Exception:
                pass

            count += 1
            if count % 100 == 0:
                print(f"  Processed {count}/{len(tasks_to_run)} emails (saved {saved_count})...", flush=True)
                with open(output_json, 'w', encoding='utf-8') as f:
                    json.dump(store, f, ensure_ascii=False, separators=(',', ':'))

    print(f"Successfully processed {count} unique emails! Total keys in store: {len(store)}", flush=True)
    os.makedirs(os.path.dirname(output_json), exist_ok=True)
    with open(output_json, 'w', encoding='utf-8') as f:
        json.dump(store, f, ensure_ascii=False, separators=(',', ':'))

    print(f"Saved to {output_json} (size: {os.path.getsize(output_json)} bytes)", flush=True)

if __name__ == '__main__':
    main()
