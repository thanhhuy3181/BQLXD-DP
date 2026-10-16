import os
import sys
import json
import extract_msg

try:
    import pypdf
except ImportError:
    pypdf = None

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

def extract_single(msg_path):
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

        folder_path = os.path.dirname(msg_path)
        pdf_transcript = ''
        if is_encrypted and folder_path and os.path.exists(folder_path):
            candidates = [f for f in os.listdir(folder_path) if f.lower().endswith('.pdf')]
            for c in candidates:
                c_path = os.path.join(folder_path, c)
                if os.path.getsize(c_path) < 3 * 1024 * 1024 and pypdf:
                    try:
                        reader = pypdf.PdfReader(c_path)
                        parts = [p.extract_text() for p in reader.pages[:3] if p.extract_text()]
                        if parts:
                            pdf_transcript = '\n'.join(parts)
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
            'date': date_str,
            'body': body,
            'attachments': attachments,
            'is_encrypted': is_encrypted,
            'file_name': os.path.basename(msg_path)
        }
    except Exception as e:
        return None

if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit(1)
    target = sys.argv[1]
    res = extract_single(target)
    if res:
        print(json.dumps(res, ensure_ascii=False))
    else:
        sys.exit(2)
