from bs4 import BeautifulSoup
from datetime import datetime
import re
import sys
import threading
import time
import msvcrt
import os

# auth.py 파일 경로 추가
# API_KEY_DIR.txt에서 경로 읽기
script_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(script_dir)
api_key_dir_path = os.path.join(project_root, 'API_KEY_DIR.txt')

try:
    with open(api_key_dir_path, 'r', encoding='utf-8') as f:
        api_key_dir = f.read().strip()
    if api_key_dir:
        sys.path.append(api_key_dir)
    else:
        raise ValueError("API_KEY_DIR.txt 파일이 비어있습니다.")
except FileNotFoundError:
    print(f"오류: API_KEY_DIR.txt 파일을 찾을 수 없습니다. ({api_key_dir_path})")
    sys.exit(1)
except Exception as e:
    print(f"오류: API_KEY_DIR.txt 파일을 읽는 중 문제가 발생했습니다: {e}")
    sys.exit(1)

from auth import get_credentials

from googleapiclient.discovery import build

def parse_keywords(html_content, category_id=''):
    """
    HTML 콘텐츠를 파싱하여 키워드 정보를 추출합니다.
    
    Args:
        html_content: HTML 문자열
        category_id: 카테고리ID (기본값: 빈 문자열)
    
    Returns:
        추출된 키워드 정보 리스트
    """
    soup = BeautifulSoup(html_content, 'html.parser')
    
    # 오늘 날짜
    today = datetime.now().strftime('%Y-%m-%d')
    
    # 카테고리 추출 (strong 태그에서 "여성패션" 같은 텍스트 추출)
    category_tag = soup.find('strong', {'data-v-53787c54': ''})
    category = ''
    if category_tag:
        category_text = category_tag.get_text(strip=True)
        # 따옴표 제거
        category = category_text.strip('"')
    
    # 키워드 항목들 추출
    keyword_items = soup.find_all('div', class_='_keyword-item-container_1vje2_11')
    
    results = []
    
    for item in keyword_items:
        # 순위 추출
        rank_tag = item.find('div', class_='_keyword-item-number_1vje2_22')
        rank = ''
        if rank_tag:
            rank = rank_tag.get_text(strip=True)
        
        # 키워드 추출
        keyword_tag = item.find('div', class_='_keyword-item-content_1vje2_46')
        keyword = ''
        if keyword_tag:
            keyword = keyword_tag.get_text(strip=True)
        
        # 순위와 키워드가 모두 있을 때만 결과에 추가
        if rank and keyword:
            result = {
                '오늘날짜': today,
                '유형': 'cp_keyword',
                '카테고리ID': category_id,
                '카테고리': category,
                '순위': rank,
                '순위상승': '',
                '키워드': keyword
            }
            results.append(result)
    
    return results

def print_results(results):
    """
    결과를 요청된 형식으로 출력합니다.
    """
    for result in results:
        print(f"1. 오늘날짜 : {result['오늘날짜']}")
        print(f"2. 유형 : {result['유형']}")
        print(f"3. 카테고리ID : {result['카테고리ID']}")
        print(f"4. 카테고리 : {result['카테고리']}")
        print(f"5. 순위 : {result['순위']}")
        print(f"6. 순위상승 : {result['순위상승']}")
        print(f"7. 키워드 : {result['키워드']}")
        print("-" * 50)

def is_light_gray1(rgb_color):
    """
    RGB 색상이 연한 회색1인지 확인합니다.
    
    Args:
        rgb_color: RGB 색상 딕셔너리 또는 None
    
    Returns:
        연한 회색1이면 True, 아니면 False
    """
    if rgb_color is None:
        return False
    
    # RGB 값 추출 (0.0 ~ 1.0 범위)
    red = rgb_color.get('red', 0.0)
    green = rgb_color.get('green', 0.0)
    blue = rgb_color.get('blue', 0.0)
    
    # 연한 회색1: RGB(217, 217, 217) = (0.851, 0.851, 0.851)
    # 약간의 오차 허용 (0.84 ~ 0.86)
    if (0.84 <= red <= 0.86 and 
        0.84 <= green <= 0.86 and 
        0.84 <= blue <= 0.86):
        return True
    
    return False

def is_light_gray2(rgb_color):
    """
    RGB 색상이 연한 회색2인지 확인합니다.
    
    Args:
        rgb_color: RGB 색상 딕셔너리 또는 None
    
    Returns:
        연한 회색2이면 True, 아니면 False
    """
    if rgb_color is None:
        return False
    
    # RGB 값 추출 (0.0 ~ 1.0 범위)
    red = rgb_color.get('red', 0.0)
    green = rgb_color.get('green', 0.0)
    blue = rgb_color.get('blue', 0.0)
    
    # 연한 회색2: RGB(191, 191, 191) = (0.749, 0.749, 0.749)
    # 약간의 오차 허용 (0.73 ~ 0.77)
    if (0.73 <= red <= 0.77 and 
        0.73 <= green <= 0.77 and 
        0.73 <= blue <= 0.77):
        return True
    
    return False

def is_white_or_no_color(rgb_color):
    """
    RGB 색상이 흰색이거나 없는지 확인합니다.
    
    Args:
        rgb_color: RGB 색상 딕셔너리 또는 None
    
    Returns:
        흰색이거나 없으면 True, 아니면 False
    """
    if rgb_color is None:
        return True
    
    # RGB 값 추출 (0.0 ~ 1.0 범위)
    red = rgb_color.get('red', 1.0)
    green = rgb_color.get('green', 1.0)
    blue = rgb_color.get('blue', 1.0)
    
    # 흰색인지 확인 (모든 값이 1.0에 가까우면 흰색)
    # 또는 alpha가 0이면 투명(색상 없음)
    alpha = rgb_color.get('alpha', 1.0)
    
    if alpha == 0.0:
        return True
    
    # 흰색 체크 (1.0 또는 0.99 이상)
    if red >= 0.99 and green >= 0.99 and blue >= 0.99:
        return True
    
    return False

def get_html_from_sheet():
    """
    '0.(DB)쿠팡카테고리' 시트에서 J열이 빈칸인 행의 I열 HTML, A열 카테고리ID, D열 카테고리명을 가져옵니다.
    
    Returns:
        (행 번호, HTML 내용, 카테고리ID, 카테고리명) 튜플 리스트
    """
    SPREADSHEET_ID = "1YWiFGyJjNDbOC8eFTbS1HEhmxfZAC-hLvI8KdA1Gku8"
    SOURCE_SHEET_NAME = "0.(DB)쿠팡카테고리"
    
    try:
        # 인증 정보 가져오기
        creds = get_credentials()
        
        # Sheets API 서비스 빌드
        service = build('sheets', 'v4', credentials=creds)
        sheet = service.spreadsheets()
        
        # A열 데이터 가져오기
        a_col_data = sheet.values().get(
            spreadsheetId=SPREADSHEET_ID,
            range=f"'{SOURCE_SHEET_NAME}'!A:A"
        ).execute()
        
        # D열 데이터 가져오기
        d_col_data = sheet.values().get(
            spreadsheetId=SPREADSHEET_ID,
            range=f"'{SOURCE_SHEET_NAME}'!D:D"
        ).execute()
        
        # I열, J열 데이터 가져오기
        ij_col_data = sheet.values().get(
            spreadsheetId=SPREADSHEET_ID,
            range=f"'{SOURCE_SHEET_NAME}'!I:J"
        ).execute()
        
        a_values = a_col_data.get('values', [])
        d_values = d_col_data.get('values', [])
        ij_values = ij_col_data.get('values', [])
        
        # J열이 빈칸인 행의 I열 HTML, A열 카테고리ID, D열 카테고리명 추출 (행 번호는 1-based)
        html_rows = []
        for idx, row in enumerate(ij_values, start=1):
            i_col = row[0] if len(row) > 0 and row[0] else ''  # I열
            j_col = row[1] if len(row) > 1 and row[1] else ''  # J열
            
            # I열에 HTML이 있고, J열이 빈칸인 경우만 선택
            if i_col and not j_col.strip():
                # 같은 행의 A열 카테고리ID 가져오기
                category_id = ''
                if idx <= len(a_values) and len(a_values[idx - 1]) > 0:
                    category_id = a_values[idx - 1][0] if a_values[idx - 1][0] else ''
                
                # 같은 행의 D열 카테고리명 가져오기
                category_name = ''
                if idx <= len(d_values) and len(d_values[idx - 1]) > 0:
                    category_name = d_values[idx - 1][0] if d_values[idx - 1][0] else ''
                
                html_rows.append((idx, i_col, category_id, category_name))
        
        return html_rows
        
    except Exception as e:
        print(f"시트에서 HTML을 가져오는 중 오류 발생: {e}")
        import traceback
        traceback.print_exc()
        return []

def update_processing_log(row_number, log_message):
    """
    '0.(DB)쿠팡카테고리' 시트의 특정 행의 J열에 처리 로그를 남깁니다.
    
    Args:
        row_number: 행 번호 (1-based)
        log_message: 로그 메시지
    """
    SPREADSHEET_ID = "1YWiFGyJjNDbOC8eFTbS1HEhmxfZAC-hLvI8KdA1Gku8"
    SOURCE_SHEET_NAME = "0.(DB)쿠팡카테고리"
    
    try:
        # 인증 정보 가져오기
        creds = get_credentials()
        
        # Sheets API 서비스 빌드
        service = build('sheets', 'v4', credentials=creds)
        sheet = service.spreadsheets()
        
        # J열에 로그 작성
        body = {
            'values': [[log_message]]
        }
        
        sheet.values().update(
            spreadsheetId=SPREADSHEET_ID,
            range=f"'{SOURCE_SHEET_NAME}'!J{row_number}",
            valueInputOption='USER_ENTERED',
            body=body
        ).execute()
        
    except Exception as e:
        print(f"로그 작성 중 오류 발생: {e}")
        import traceback
        traceback.print_exc()

def get_previous_rank(sheet, spreadsheet_id, sheet_name, category_id, keyword, current_date):
    """
    같은 카테고리ID와 키워드의 이전 순위를 찾습니다.
    
    Args:
        sheet: Sheets API 서비스 객체
        spreadsheet_id: 스프레드시트 ID
        sheet_name: 시트 이름
        category_id: 카테고리ID
        keyword: 키워드
        current_date: 현재 날짜 (YYYY-MM-DD 형식)
    
    Returns:
        이전 순위 (int) 또는 None (이전 데이터가 없는 경우)
    """
    try:
        # 전체 데이터 가져오기
        all_data = sheet.values().get(
            spreadsheetId=spreadsheet_id,
            range=f"'{sheet_name}'!A:H"
        ).execute()
        
        values = all_data.get('values', [])
        
        # 헤더 행이 있으면 제외
        if not values or len(values) == 0:
            return None
        
        # 같은 카테고리ID의 데이터 중에서
        # 현재 날짜보다 이전 날짜의 데이터를 찾기
        previous_ranks = []
        
        for row in values:
            if len(row) < 7:  # 최소 A~G열 필요
                continue
            
            row_date = row[0] if len(row) > 0 else ''  # A열: 날짜
            row_category_id = row[2] if len(row) > 2 else ''  # C열: 카테고리ID
            row_keyword = row[5] if len(row) > 5 else ''  # F열: 키워드
            row_rank = row[4] if len(row) > 4 else ''  # E열: 순위
            
            # 같은 카테고리ID와 키워드인지 확인
            if row_category_id == category_id and row_keyword == keyword:
                # 날짜 비교 (현재 날짜보다 이전인지)
                try:
                    row_date_obj = datetime.strptime(row_date, '%Y-%m-%d')
                    current_date_obj = datetime.strptime(current_date, '%Y-%m-%d')
                    
                    if row_date_obj < current_date_obj:
                        # 순위가 숫자인지 확인
                        try:
                            rank = int(row_rank)
                            previous_ranks.append((row_date_obj, rank))
                        except (ValueError, TypeError):
                            continue
                except (ValueError, TypeError):
                    continue
        
        # 가장 최근 날짜의 순위 반환
        if previous_ranks:
            previous_ranks.sort(key=lambda x: x[0], reverse=True)  # 날짜 내림차순 정렬
            return previous_ranks[0][1]  # 가장 최근 순위 반환
        
        return None
        
    except Exception as e:
        print(f"  이전 순위 조회 중 오류 발생: {e}")
        return None

def calculate_rank_change(current_rank, previous_rank):
    """
    순위 변화를 계산합니다.
    
    Args:
        current_rank: 현재 순위 (int)
        previous_rank: 이전 순위 (int 또는 None)
    
    Returns:
        순위 변화 문자열: "▲3", "▼2", "(-)", "new"
    """
    if previous_rank is None:
        return "new"
    
    try:
        current = int(current_rank)
        previous = int(previous_rank)
        
        change = previous - current  # 이전 순위 - 현재 순위 (상승하면 양수)
        
        if change > 0:
            return f"▲{change}"
        elif change < 0:
            return f"▼{abs(change)}"  # 절댓값 사용
        else:
            return "(-)"
    except (ValueError, TypeError):
        return "(-)"

def input_with_timeout(prompt, timeout=15, default='y'):
    """
    타임아웃이 있는 입력 함수. 지정된 시간 동안 입력이 없으면 기본값 반환.
    
    Args:
        prompt: 프롬프트 메시지
        timeout: 타임아웃 시간 (초)
        default: 타임아웃 시 반환할 기본값
    
    Returns:
        사용자 입력 또는 기본값
    """
    import sys
    import os
    
    # Windows에서 ANSI escape codes 활성화
    if sys.platform == 'win32':
        try:
            import ctypes
            kernel32 = ctypes.windll.kernel32
            kernel32.SetConsoleMode(kernel32.GetStdHandle(-11), 7)
        except:
            pass
    
    user_input = ''
    start_time = time.time()
    input_received = threading.Event()
    last_countdown = timeout + 1
    user_typing = threading.Event()
    lock = threading.Lock()
    
    def countdown():
        """카운트다운을 표시하는 함수"""
        nonlocal last_countdown
        # 초기 출력
        countdown_text = f" ({timeout}초 후 자동 진행)"
        full_text = f"{prompt}{countdown_text} "
        sys.stdout.write(full_text)
        sys.stdout.flush()
        
        while not input_received.is_set():
            elapsed = time.time() - start_time
            remaining = max(0, timeout - int(elapsed))
            
            if remaining != last_countdown and remaining > 0 and not user_typing.is_set():
                with lock:
                    countdown_text = f" ({remaining}초 후 자동 진행)"
                    full_text = f"{prompt}{countdown_text} "
                    # ANSI escape code로 전체 줄을 지우고 다시 쓰기
                    sys.stdout.write(f"\r\033[2K{full_text}")
                    sys.stdout.flush()
                    last_countdown = remaining
            
            if elapsed >= timeout:
                break
            
            time.sleep(0.1)
    
    # 카운트다운 스레드 시작
    countdown_thread = threading.Thread(target=countdown, daemon=True)
    countdown_thread.start()
    
    # 입력 대기
    try:
        while True:
            if msvcrt.kbhit():
                user_typing.set()  # 사용자가 입력 중임을 표시
                char = msvcrt.getch()
                if char == b'\r':  # Enter 키
                    input_received.set()
                    with lock:
                        sys.stdout.write("\n")
                        sys.stdout.flush()
                    break
                elif char == b'\x08':  # Backspace
                    if len(user_input) > 0:
                        user_input = user_input[:-1]
                        with lock:
                            remaining = max(0, timeout - int(time.time() - start_time))
                            countdown_text = f" ({remaining}초 후 자동 진행)"
                            full_text = f"{prompt}{countdown_text} {user_input} "
                            sys.stdout.write(f"\r\033[2K{full_text}")
                            sys.stdout.flush()
                else:
                    try:
                        char_str = char.decode('utf-8')
                        if char_str.isprintable():
                            user_input += char_str
                            with lock:
                                remaining = max(0, timeout - int(time.time() - start_time))
                                countdown_text = f" ({remaining}초 후 자동 진행)"
                                full_text = f"{prompt}{countdown_text} {user_input} "
                                sys.stdout.write(f"\r\033[2K{full_text}")
                                sys.stdout.flush()
                    except:
                        pass
            
            # 타임아웃 확인
            if time.time() - start_time >= timeout:
                input_received.set()
                with lock:
                    sys.stdout.write(f"\r\033[2K{prompt} 자동으로 '{default}' 처리합니다.\n")
                    sys.stdout.flush()
                return default
            
            time.sleep(0.05)
        
        return user_input.strip().lower() if user_input.strip() else default
        
    except KeyboardInterrupt:
        input_received.set()
        sys.stdout.write("\n입력이 중단되었습니다.\n")
        sys.stdout.flush()
        return 'n'
    except Exception as e:
        input_received.set()
        sys.stdout.write(f"\n입력 중 오류 발생: {e}\n")
        sys.stdout.flush()
        return default

def write_to_sheet(results):
    """
    추출된 키워드 정보를 Google Sheets에 입력합니다.
    
    Args:
        results: 추출된 키워드 정보 리스트
    """
    # 스프레드시트 ID와 시트 이름
    SPREADSHEET_ID = "1YWiFGyJjNDbOC8eFTbS1HEhmxfZAC-hLvI8KdA1Gku8"
    SHEET_NAME = "0.(DB)쿠팡_탑텐키워드"
    
    if not results:
        print("스프레드시트에 입력할 데이터가 없습니다.")
        return
    
    try:
        # 인증 정보 가져오기
        creds = get_credentials()
        
        # Sheets API 서비스 빌드
        service = build('sheets', 'v4', credentials=creds)
        sheet = service.spreadsheets()
        
        # 시트 정보 가져오기 (시트 ID 확인)
        spreadsheet = sheet.get(spreadsheetId=SPREADSHEET_ID).execute()
        sheet_id = None
        for sheet_info in spreadsheet.get('sheets', []):
            if sheet_info['properties']['title'] == SHEET_NAME:
                sheet_id = sheet_info['properties']['sheetId']
                break
        
        if sheet_id is None:
            print(f"시트 '{SHEET_NAME}'를 찾을 수 없습니다.")
            return
        
        # 현재 시트의 마지막 행 번호 확인
        existing_data = sheet.values().get(
            spreadsheetId=SPREADSHEET_ID,
            range=f"'{SHEET_NAME}'!A:H"
        ).execute()
        
        existing_values = existing_data.get('values', [])
        last_row = len(existing_values)  # 1-based index (다음에 추가할 행 번호)
        
        print(f"  디버깅: 현재 마지막 행 번호 = {last_row}")
        
        # 바로 위 행의 배경색 확인 (마지막 행이 있으면)
        should_apply_gray = False
        if last_row > 0:
            try:
                # 마지막 행의 첫 번째 셀(A열)의 배경색 확인
                print(f"  디버깅: {last_row}행의 배경색 확인 중...")
                cell_format = sheet.get(
                    spreadsheetId=SPREADSHEET_ID,
                    ranges=[f"'{SHEET_NAME}'!A{last_row}"],
                    fields='sheets.data.rowData.values.userEnteredFormat.backgroundColor'
                ).execute()
                
                # 배경색 추출
                bg_color = None
                try:
                    sheets_data = cell_format.get('sheets', [])
                    if sheets_data:
                        sheet_data = sheets_data[0].get('data', [])
                        if sheet_data:
                            row_data = sheet_data[0]
                            if row_data.get('rowData'):
                                first_row = row_data['rowData'][0]
                                if first_row.get('values') and len(first_row['values']) > 0:
                                    bg_color = first_row['values'][0].get('userEnteredFormat', {}).get('backgroundColor')
                                    print(f"  디버깅: 배경색 추출 성공 - {bg_color}")
                except (IndexError, KeyError, TypeError) as e:
                    # 배경색을 가져올 수 없으면 기본값으로 처리
                    bg_color = None
                    print(f"  디버깅: 배경색 추출 실패 - {e}")
                
                # 배경색 적용 조건:
                # 배경색을 확인할 수 없거나 색상이 있으면 → 배경색 적용 안 함
                # 오직 흰색이거나 없거나 연한 회색1일 때만 → 연한 회색2 적용
                if bg_color is None:
                    # 배경색을 확인할 수 없으면 기본적으로 적용하지 않음
                    should_apply_gray = False
                    print(f"  배경색을 확인할 수 없어 배경색을 적용하지 않습니다.")
                elif is_light_gray2(bg_color):
                    # 연한 회색2이면 배경색 적용 안 함 (이미 회색이므로)
                    should_apply_gray = False
                    print(f"  바로 위 행이 연한 회색2여서 배경색을 적용하지 않습니다.")
                elif is_white_or_no_color(bg_color) or is_light_gray1(bg_color):
                    # 흰색이거나 없거나 연한 회색1이면 연한 회색2 적용
                    should_apply_gray = True
                    print(f"  바로 위 행이 흰색/없음/연한회색1이어서 연한 회색2를 적용합니다.")
                else:
                    # 다른 색상이 있으면 배경색 적용 안 함
                    should_apply_gray = False
                    print(f"  바로 위 행에 다른 색상이 있어 배경색을 적용하지 않습니다. (RGB: {bg_color.get('red', 0):.3f}, {bg_color.get('green', 0):.3f}, {bg_color.get('blue', 0):.3f})")
            except Exception as e:
                # 배경색 확인 실패 시 기본적으로 회색 적용하지 않음
                print(f"  배경색 확인 중 오류 발생 (기본값 사용): {e}")
                import traceback
                traceback.print_exc()
                should_apply_gray = False
        else:
            # 데이터가 없으면 첫 번째 행이므로 회색 적용 안 함
            should_apply_gray = False
            print(f"  디버깅: 데이터가 없어 첫 번째 행입니다.")
        
        # 각 키워드의 이전 순위를 조회하여 순위상승 계산
        print("  이전 순위 조회 중...")
        for result in results:
            category_id = result.get('카테고리ID', '')
            keyword = result.get('키워드', '')
            current_rank = result.get('순위', '')
            current_date = result.get('오늘날짜', '')
            
            if category_id and keyword and current_rank:
                previous_rank = get_previous_rank(
                    sheet, SPREADSHEET_ID, SHEET_NAME, 
                    category_id, keyword, current_date
                )
                rank_change = calculate_rank_change(current_rank, previous_rank)
                result['순위상승'] = rank_change
                # 디버깅 정보 출력
                if previous_rank is not None:
                    print(f"    {keyword}: 이전 {previous_rank}위 → 현재 {current_rank}위 = {rank_change}")
                else:
                    print(f"    {keyword}: 이전 데이터 없음 = {rank_change}")
        
        print("  텍스트 색상: ▲와 new는 빨간색, ▼는 파란색, (-)는 검정색으로 설정됩니다.")
        
        # 데이터를 스프레드시트 형식으로 변환
        # A열: 날짜, B열: 유형, C열: 카테고리ID, D열: 카테고리, 
        # E열: 순위, F열: 키워드, G열: 순위상승, H열: 체크박스(TRUE)
        values = []
        for result in results:
            row = [
                result['오늘날짜'],      # A열: 날짜
                result['유형'],          # B열: 유형
                result['카테고리ID'],     # C열: 카테고리ID
                result['카테고리'],       # D열: 카테고리
                result['순위'],          # E열: 순위
                result['키워드'],        # F열: 키워드
                result['순위상승'],      # G열: 순위상승
                'TRUE'                   # H열: 체크박스
            ]
            values.append(row)
        
        # 스프레드시트에 데이터 추가 (append)
        body = {
            'values': values
        }
        
        append_result = sheet.values().append(
            spreadsheetId=SPREADSHEET_ID,
            range=f"'{SHEET_NAME}'!A:H",
            valueInputOption='USER_ENTERED',
            insertDataOption='INSERT_ROWS',
            body=body
        ).execute()
        
        updated_cells = append_result.get('updates', {}).get('updatedCells', 0)
        updated_range = append_result.get('updates', {}).get('updatedRange', '')
        
        # G열(순위상승) 텍스트 색상 설정
        import re
        range_match = re.search(r'A(\d+):H(\d+)', updated_range)
        if range_match:
            start_row = int(range_match.group(1))
            end_row = int(range_match.group(2))
            
            # G열(인덱스 6)에 텍스트 색상 설정
            text_color_requests = []
            
            for idx, result in enumerate(results):
                rank_change = result.get('순위상승', '')
                row_idx = start_row - 1 + idx  # 0-based index
                
                if rank_change.startswith('▲') or rank_change == 'new':
                    # 빨간색 텍스트
                    text_color_requests.append({
                        'repeatCell': {
                            'range': {
                                'sheetId': sheet_id,
                                'startRowIndex': row_idx,
                                'endRowIndex': row_idx + 1,
                                'startColumnIndex': 6,  # G열
                                'endColumnIndex': 7
                            },
                            'cell': {
                                'userEnteredFormat': {
                                    'textFormat': {
                                        'foregroundColor': {
                                            'red': 1.0,
                                            'green': 0.0,
                                            'blue': 0.0
                                        }
                                    }
                                }
                            },
                            'fields': 'userEnteredFormat.textFormat.foregroundColor'
                        }
                    })
                elif rank_change.startswith('▼'):
                    # 파란색 텍스트
                    text_color_requests.append({
                        'repeatCell': {
                            'range': {
                                'sheetId': sheet_id,
                                'startRowIndex': row_idx,
                                'endRowIndex': row_idx + 1,
                                'startColumnIndex': 6,  # G열
                                'endColumnIndex': 7
                            },
                            'cell': {
                                'userEnteredFormat': {
                                    'textFormat': {
                                        'foregroundColor': {
                                            'red': 0.0,
                                            'green': 0.0,
                                            'blue': 1.0
                                        }
                                    }
                                }
                            },
                            'fields': 'userEnteredFormat.textFormat.foregroundColor'
                        }
                    })
                elif rank_change == '(-)':
                    # 검정색 텍스트
                    text_color_requests.append({
                        'repeatCell': {
                            'range': {
                                'sheetId': sheet_id,
                                'startRowIndex': row_idx,
                                'endRowIndex': row_idx + 1,
                                'startColumnIndex': 6,  # G열
                                'endColumnIndex': 7
                            },
                            'cell': {
                                'userEnteredFormat': {
                                    'textFormat': {
                                        'foregroundColor': {
                                            'red': 0.0,
                                            'green': 0.0,
                                            'blue': 0.0
                                        }
                                    }
                                }
                            },
                            'fields': 'userEnteredFormat.textFormat.foregroundColor'
                        }
                    })
            
            # 텍스트 색상 적용
            if text_color_requests:
                text_color_body = {
                    'requests': text_color_requests
                }
                sheet.batchUpdate(
                    spreadsheetId=SPREADSHEET_ID,
                    body=text_color_body
                ).execute()
        
        # 배경색 적용이 필요한 경우
        if should_apply_gray:
            # 추가된 행의 범위 확인 (range_match는 이미 위에서 계산됨)
            if range_match:
                start_row = int(range_match.group(1))
                end_row = int(range_match.group(2))
                
                # 연한 회색2 배경색 설정 (RGB: 230, 230, 230) - 더 연한 회색
                light_gray2 = {
                    'red': 230.0 / 255.0,
                    'green': 230.0 / 255.0,
                    'blue': 230.0 / 255.0
                }
                
                # 배경색 적용 요청
                requests = [{
                    'repeatCell': {
                        'range': {
                            'sheetId': sheet_id,
                            'startRowIndex': start_row - 1,  # 0-based index
                            'endRowIndex': end_row,
                            'startColumnIndex': 0,  # A열
                            'endColumnIndex': 9     # I열까지 (0-based: A=0, B=1, ..., I=8)
                        },
                        'cell': {
                            'userEnteredFormat': {
                                'backgroundColor': light_gray2
                            }
                        },
                        'fields': 'userEnteredFormat.backgroundColor'
                    }
                }]
                
                batch_update_body = {
                    'requests': requests
                }
                
                sheet.batchUpdate(
                    spreadsheetId=SPREADSHEET_ID,
                    body=batch_update_body
                ).execute()
                
                print(f"\n✓ 스프레드시트에 {len(values)}개의 행이 성공적으로 추가되었습니다.")
                print(f"  총 {updated_cells}개의 셀이 업데이트되었습니다.")
                print(f"  연한 회색2 배경색이 적용되었습니다.")
            else:
                print(f"\n✓ 스프레드시트에 {len(values)}개의 행이 성공적으로 추가되었습니다.")
                print(f"  총 {updated_cells}개의 셀이 업데이트되었습니다.")
        else:
            # 배경색을 적용하지 않아야 하는 경우 흰색 배경색 명시적으로 설정
            if range_match:
                start_row = int(range_match.group(1))
                end_row = int(range_match.group(2))
                
                # 흰색 배경색 설정 (RGB: 255, 255, 255)
                white_color = {
                    'red': 1.0,
                    'green': 1.0,
                    'blue': 1.0
                }
                
                # 배경색 적용 요청
                requests = [{
                    'repeatCell': {
                        'range': {
                            'sheetId': sheet_id,
                            'startRowIndex': start_row - 1,  # 0-based index
                            'endRowIndex': end_row,
                            'startColumnIndex': 0,  # A열
                            'endColumnIndex': 9     # I열까지 (0-based: A=0, B=1, ..., I=8)
                        },
                        'cell': {
                            'userEnteredFormat': {
                                'backgroundColor': white_color
                            }
                        },
                        'fields': 'userEnteredFormat.backgroundColor'
                    }
                }]
                
                batch_update_body = {
                    'requests': requests
                }
                
                sheet.batchUpdate(
                    spreadsheetId=SPREADSHEET_ID,
                    body=batch_update_body
                ).execute()
                
                print(f"\n✓ 스프레드시트에 {len(values)}개의 행이 성공적으로 추가되었습니다.")
                print(f"  총 {updated_cells}개의 셀이 업데이트되었습니다.")
                print(f"  흰색 배경색이 적용되었습니다.")
            else:
                print(f"\n✓ 스프레드시트에 {len(values)}개의 행이 성공적으로 추가되었습니다.")
                print(f"  총 {updated_cells}개의 셀이 업데이트되었습니다.")
        
    except Exception as e:
        print(f"\n✗ 스프레드시트 입력 중 오류 발생: {e}")
        import traceback
        traceback.print_exc()

def main():
    """
    시트에서 HTML을 읽어와 파싱하고 결과를 출력합니다.
    """
    print("시트에서 HTML을 읽어오는 중...")
    print("-" * 50)
    
    # 시트에서 HTML 목록 가져오기
    html_rows = get_html_from_sheet()
    
    if not html_rows:
        print("처리할 HTML이 없습니다. (J열이 빈칸인 행이 없습니다.)")
        return
    
    print(f"총 {len(html_rows)}개의 HTML을 찾았습니다.\n")
    
    # 각 HTML을 순차적으로 처리
    for idx, (row_number, html_content, category_id, expected_category_name) in enumerate(html_rows, start=1):
        print(f"\n{'='*60}")
        print(f"[{idx}/{len(html_rows)}] 행 {row_number} 처리 중...")
        if category_id:
            print(f"카테고리ID: {category_id}")
        if expected_category_name:
            print(f"시트의 카테고리명: {expected_category_name}")
        print(f"{'='*60}\n")
        
        if not html_content.strip():
            print(f"행 {row_number}: HTML이 비어있습니다. 건너뜁니다.")
            update_processing_log(row_number, f"건너뜀: HTML이 비어있음")
            continue
        
        # HTML 파싱 및 결과 추출 (카테고리ID 전달)
        results = parse_keywords(html_content, category_id)
        
        if results:
            # HTML에서 파싱한 카테고리명 확인
            parsed_category_name = results[0].get('카테고리', '') if results else ''
            
            # 카테고리명 불일치 확인
            if expected_category_name and parsed_category_name:
                if expected_category_name.strip() != parsed_category_name.strip():
                    print(f"\n⚠️ 경고: 카테고리명 불일치 감지!")
                    print(f"  시트의 카테고리명 (D{row_number}): {expected_category_name}")
                    print(f"  HTML에서 파싱한 카테고리명: {parsed_category_name}")
                    print(f"\n  이는 I{row_number}열의 HTML이 잘못 입력되었을 가능성이 있습니다.")
                    print(f"  자동으로 취소 처리합니다.")
                    update_processing_log(row_number, f"⚠️ 취소됨: 카테고리명 불일치 (시트:{expected_category_name}, HTML:{parsed_category_name})")
                    continue
            
            print("\n=== 추출된 키워드 정보 ===\n")
            print_results(results)
            
            # 사용자 확인 (15초 타임아웃)
            response = input_with_timeout(
                f"\n[{idx}/{len(html_rows)}] 스프레드시트에 데이터를 입력하시겠습니까? (y/n): ",
                timeout=15,
                default='y'
            )
            
            if response == 'y' or response == 'yes':
                write_to_sheet(results)
                # 처리 완료 로그 작성
                timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                update_processing_log(row_number, f"처리 완료: {timestamp}")
                print(f"✓ 행 {row_number} 처리 완료 및 로그 기록됨")
            else:
                print("스프레드시트 입력을 취소했습니다.")
                update_processing_log(row_number, f"취소됨: 사용자 취소")
        else:
            print("키워드를 찾을 수 없습니다.")
            update_processing_log(row_number, f"오류: 키워드를 찾을 수 없음")
    
    print(f"\n{'='*60}")
    print("모든 HTML 처리 완료!")
    print(f"{'='*60}")

if __name__ == "__main__":
    main()

