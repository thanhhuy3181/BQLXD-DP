import os
import sys
import json
import re
import unicodedata
import extract_msg

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
    except Exception as e:
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
        date_str = str(msg.date or '').strip()
        body = str(msg.body or '').strip()

        attachments = []
        is_encrypted = False
        try:
            for att in msg.attachments:
                att_name = att.longFilename or att.shortFilename or 'attachment'
                attachments.append(att_name)
                if 'rpmsg' in att_name.lower():
                    is_encrypted = True
        except Exception:
            pass

        if 'has sent you a protected message' in body.lower():
            is_encrypted = True

        # Only search for PDF transcript if the email is encrypted (e.g. Purview/rpmsg)
        pdf_transcript = ''
        if is_encrypted and folder_path and os.path.exists(folder_path):
            base_no_ext = os.path.splitext(os.path.basename(msg_path))[0].lower()
            prefix_match = re.search(r'^\d{6}', base_no_ext)
            prefix = prefix_match.group(0) if prefix_match else ''
            candidates = [f for f in os.listdir(folder_path) if f.lower().endswith('.pdf')]
            
            for c in candidates:
                c_low = c.lower()
                # Must match prefix (e.g. 261012) or key words
                if prefix and prefix in c_low:
                    c_path = os.path.join(folder_path, c)
                    if os.path.getsize(c_path) < 3 * 1024 * 1024:
                        pdf_t = extract_pdf_text(c_path, max_pages=3)
                        if pdf_t:
                            pdf_transcript = pdf_t
                            break

        if pdf_transcript:
            body = f"[NỘI DUNG THƯ TRÍCH XUẤT TỪ BẢN IN KÈM THEO]\n\n{pdf_transcript}\n\n---\n[THÔNG BÁO BẢO MẬT GỐC]:\n{body}"

        return {
            'subject': subject,
            'sender': sender,
            'to': to_recipients,
            'cc': cc_recipients,
            'date': date_str,
            'body': body,
            'attachments': attachments,
            'is_encrypted': is_encrypted,
            'file_name': os.path.basename(msg_path)
        }
    except Exception as e:
        print(f"Error parsing {msg_path}: {e}", file=sys.stderr)
        return None

def main():
    root_folder = r'Z:\My Drive\VH\01. Phe duyet\01. Chi dao'
    workspace_json = r'c:\Users\Lines\Desktop\anti\work\Phần mềm tự tạo word PH HSMT\vercel-app\api\data\menu_workspace.json'
    output_json = r'c:\Users\Lines\Desktop\anti\work\Phần mềm tự tạo word PH HSMT\vercel-app\api\data\msg_store.json'

    store = {}
    if os.path.exists(output_json):
        try:
            with open(output_json, 'r', encoding='utf-8') as f:
                store = json.load(f)
            print(f"Loaded {len(store)} existing entries from msg_store.json", flush=True)
        except Exception:
            store = {}

    def add_entry(key_file, entry, extra_keys=None):
        clean_name = os.path.basename(key_file).strip()
        no_ext = os.path.splitext(clean_name)[0].strip()
        norm_name = normalize_key(no_ext)
        store[clean_name] = entry
        store[no_ext] = entry
        if norm_name:
            store[norm_name] = entry
        if extra_keys:
            for ek in extra_keys:
                if ek:
                    store[ek.strip()] = entry
                    store[normalize_key(ek)] = entry

    # Step 1: Scan 01. Chi dao
    print(f"Scanning folder: {root_folder}...", flush=True)
    count = 0
    for root, dirs, files in os.walk(root_folder):
        for f in files:
            if f.lower().endswith('.msg'):
                msg_path = os.path.join(root, f)
                data = parse_msg_file(msg_path, root)
                if data:
                    add_entry(f, data)
                    count += 1
                    if count % 20 == 0:
                        print(f"  Processed {count} files in Chi dao...", flush=True)

    print(f"Extracted {count} messages from {root_folder}", flush=True)

    # Save immediately after Chi dao
    os.makedirs(os.path.dirname(output_json), exist_ok=True)
    with open(output_json, 'w', encoding='utf-8') as f:
        json.dump(store, f, ensure_ascii=False, indent=2)
    print(f"Checkpoint saved: {len(store)} keys in msg_store.json", flush=True)

    # Step 2: Scan Vinhomes Đan Phượng tabs in workspace
    if os.path.exists(workspace_json):
        print("Scanning Vinhomes Đan Phượng items from workspace...", flush=True)
        with open(workspace_json, 'r', encoding='utf-8') as f:
            ws_data = json.load(f)
        
        dp_tabs = ws_data.get('Vinhomes Đan Phượng', {})
        dp_count = 0
        for tab_name, tab_data in dp_tabs.items():
            items = tab_data.get('items', []) if isinstance(tab_data, dict) else (tab_data if isinstance(tab_data, list) else [])
            for it in items:
                ten = str(it.get('ten_tai_lieu', ''))
                folder = str(it.get('folder', '') or it.get('path', ''))
                noi_dung = str(it.get('noi_dung', ''))
                if '.msg' in ten.lower() and folder and os.path.exists(folder):
                    for line in ten.splitlines():
                        if '.msg' in line.lower():
                            fn = line.strip().lstrip('-*• ').strip()
                            if fn in store:
                                if noi_dung:
                                    store[noi_dung] = store[fn]
                                    store[normalize_key(noi_dung)] = store[fn]
                                continue
                            fp = os.path.join(folder, fn)
                            if os.path.exists(fp):
                                d = parse_msg_file(fp, folder)
                                if d:
                                    add_entry(fn, d, [noi_dung])
                                    dp_count += 1
                                    if dp_count % 20 == 0:
                                        print(f"  Processed {dp_count} additional DP files...", flush=True)

        print(f"Added {dp_count} files from Vinhomes Đan Phượng tabs.", flush=True)

    with open(output_json, 'w', encoding='utf-8') as f:
        json.dump(store, f, ensure_ascii=False, indent=2)

    print(f"COMPLETED! Total keys in store: {len(store)}. Size: {os.path.getsize(output_json)} bytes", flush=True)

if __name__ == '__main__':
    main()
