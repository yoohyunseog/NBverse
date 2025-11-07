import math
import ast


def parse_vector(s: str):
    s = s.strip()
    # 허용: "[1, 2, 3]" 같은 파이썬 리스트 리터럴
    if s.startswith('[') and s.endswith(']'):
        try:
            v = ast.literal_eval(s)
            return [float(x) for x in v]
        except Exception:
            pass
    # 허용: "1,2,3" 또는 "1 2 3"
    if ',' in s:
        parts = s.split(',')
    else:
        parts = s.split()
    return [float(x) for x in parts]


def cosine_similarity(vec1, vec2):
    if len(vec1) != len(vec2):
        raise ValueError("두 벡터의 길이가 같아야 합니다.")
    dot = sum(a * b for a, b in zip(vec1, vec2))
    mag1 = math.sqrt(sum(a * a for a in vec1))
    mag2 = math.sqrt(sum(b * b for b in vec2))
    if mag1 == 0 or mag2 == 0:
        raise ValueError("영벡터와의 코사인 유사도는 정의되지 않습니다.")
    return dot / (mag1 * mag2)


def main():
    print("첫 번째 벡터를 입력하세요 (예: 1 2 3 | 1,2,3 | [1,2,3])")
    v1 = parse_vector(input("> "))
    print("두 번째 벡터를 입력하세요 (예: 4 5 6 | 4,5,6 | [4,5,6])")
    v2 = parse_vector(input("> "))
    sim = cosine_similarity(v1, v2)
    print(f"Cosine Similarity: {sim:.10f}")


if __name__ == "__main__":
    main()


