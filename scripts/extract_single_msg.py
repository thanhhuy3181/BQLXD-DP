import os
import sys
import json
import re
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

        folder_path = os.path.dirname(msg_path)
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
                        if os.path.getsize(c_path) < 3 * 1024 * 1024 and pypdf:
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
            'bcc': bcc_recipients,
            'date': date_str,
            'body': body,
            'attachments': attachments,
            'nested_messages': nested_messages,
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
