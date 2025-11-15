"""
Test script to verify 100 KB request size limit
"""
import requests
import base64
import json

BASE_URL = "http://localhost:8000"
USERNAME = "bmfa_user"
PASSWORD = "your_secure_password_here"

def get_auth_header():
    """Generate Basic Auth header"""
    credentials = f"{USERNAME}:{PASSWORD}"
    encoded = base64.b64encode(credentials.encode()).decode()
    return {"Authorization": f"Basic {encoded}"}

def test_request_size_limit():
    """Test that requests over 100 KB are rejected"""
    print("\n" + "="*60)
    print("TEST: Request Size Limit (100 KB)")
    print("="*60)
    
    # Create a very large payload (over 100 KB)
    # 2500 points should be around 125 KB
    large_stroke = []
    for i in range(2500):
        large_stroke.append({
            "x": 100.0 + i * 2.0,
            "y": 150.0 + i * 1.5,
            "t": i * 15,
            "p": 0.75
        })
    
    payload = {
        "normalized_stroke": large_stroke,
        "features": {
            "num_points": 2500,
            "total_distance": 5000.0,
            "velocity_mean": 2.5,
            "velocity_max": 5.8,
            "duration_ms": 37500
        }
    }
    
    # Calculate payload size
    payload_json = json.dumps(payload)
    payload_size_bytes = len(payload_json.encode('utf-8'))
    payload_size_kb = payload_size_bytes / 1024
    
    print(f"Payload size: {payload_size_bytes} bytes ({payload_size_kb:.2f} KB)")
    print(f"Expected: Should be rejected if > 102,400 bytes (100 KB)")
    print()
    
    url = f"{BASE_URL}/api/biometric/validate"
    headers = get_auth_header()
    headers["Content-Type"] = "application/json"
    
    try:
        response = requests.post(url, json=payload, headers=headers)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {json.dumps(response.json(), indent=2)}")
        
        if payload_size_bytes > 102400:
            if response.status_code == 413:
                print(f"\n✓ PASS: Large request correctly rejected (413)")
                print(f"  Payload was {payload_size_kb:.2f} KB (> 100 KB limit)")
                return True
            else:
                print(f"\n✗ FAIL: Expected 413, got {response.status_code}")
                return False
        else:
            if response.status_code == 422:
                # Pydantic validation error for too many points (expected)
                print(f"\n✓ PASS: Request within size limit but validation failed (expected)")
                return True
            else:
                print(f"\n✗ FAIL: Unexpected status code {response.status_code}")
                return False
                
    except Exception as e:
        print(f"✗ ERROR: {str(e)}")
        return False

def test_valid_size_request():
    """Test that requests under 100 KB are accepted"""
    print("\n" + "="*60)
    print("TEST: Valid Size Request (< 100 KB)")
    print("="*60)
    
    # Create normal payload (well under 100 KB)
    stroke_points = []
    for i in range(100):
        stroke_points.append({
            "x": 100.0 + i * 2.0,
            "y": 150.0 + i * 1.5,
            "t": i * 15,
            "p": 0.75
        })
    
    payload = {
        "normalized_stroke": stroke_points,
        "features": {
            "num_points": 100,
            "total_distance": 450.32,
            "velocity_mean": 2.54,
            "velocity_max": 5.82,
            "duration_ms": 1500
        }
    }
    
    payload_json = json.dumps(payload)
    payload_size_bytes = len(payload_json.encode('utf-8'))
    payload_size_kb = payload_size_bytes / 1024
    
    print(f"Payload size: {payload_size_bytes} bytes ({payload_size_kb:.2f} KB)")
    print(f"Expected: Should be accepted (< 100 KB)")
    print()
    
    url = f"{BASE_URL}/api/biometric/validate"
    headers = get_auth_header()
    headers["Content-Type"] = "application/json"
    
    try:
        response = requests.post(url, json=payload, headers=headers)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {json.dumps(response.json(), indent=2)}")
        
        if response.status_code == 200:
            print(f"\n✓ PASS: Valid request accepted")
            print(f"  Payload was {payload_size_kb:.2f} KB (< 100 KB limit)")
            return True
        else:
            print(f"\n✗ FAIL: Expected 200, got {response.status_code}")
            return False
            
    except Exception as e:
        print(f"✗ ERROR: {str(e)}")
        return False

def main():
    print("\n" + "="*60)
    print("REQUEST SIZE LIMIT TESTS - 100 KB")
    print("="*60)
    print(f"Base URL: {BASE_URL}")
    print(f"Limit: 102,400 bytes (100 KB)")
    
    results = []
    results.append(("Valid Size Request", test_valid_size_request()))
    results.append(("Large Request Rejection", test_request_size_limit()))
    
    # Summary
    print("\n" + "="*60)
    print("TEST SUMMARY")
    print("="*60)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "✓ PASS" if result else "✗ FAIL"
        print(f"{test_name}: {status}")
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n✓ Request size limit is correctly configured at 100 KB!")
    else:
        print(f"\n✗ {total - passed} test(s) failed")

if __name__ == "__main__":
    main()
