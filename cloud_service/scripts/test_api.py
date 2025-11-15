"""
Test script for Cloud Service API
Tests health endpoint and biometric validation with mock data
"""
import requests
import base64
import json
from typing import Dict, List

# Configuration
BASE_URL = "http://localhost:8000"
USERNAME = "bmfa_user"
PASSWORD = "your_secure_password_here"

def get_auth_header() -> Dict[str, str]:
    """Generate Basic Auth header"""
    credentials = f"{USERNAME}:{PASSWORD}"
    encoded = base64.b64encode(credentials.encode()).decode()
    return {"Authorization": f"Basic {encoded}"}

def test_health():
    """Test health endpoint"""
    print("\n" + "="*60)
    print("TEST 1: Health Check")
    print("="*60)
    
    url = f"{BASE_URL}/health"
    print(f"GET {url}")
    
    try:
        response = requests.get(url)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {json.dumps(response.json(), indent=2)}")
        
        if response.status_code == 200:
            print("✓ Health check passed")
            return True
        else:
            print("✗ Health check failed")
            return False
    except Exception as e:
        print(f"✗ Error: {str(e)}")
        return False

def test_validation_valid_data():
    """Test validation endpoint with valid data"""
    print("\n" + "="*60)
    print("TEST 2: Biometric Validation (Valid Data)")
    print("="*60)
    
    # Create mock stroke data (100 points)
    stroke_points = []
    for i in range(100):
        stroke_points.append({
            "x": 100.0 + i * 2.0,
            "y": 150.0 + i * 1.5,
            "t": i * 15,
            "p": 0.75 + (i % 10) * 0.02
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
    
    url = f"{BASE_URL}/api/biometric/validate"
    headers = get_auth_header()
    headers["Content-Type"] = "application/json"
    
    print(f"POST {url}")
    print(f"Authorization: Basic {USERNAME}:***")
    print(f"Payload: {len(stroke_points)} points")
    
    try:
        response = requests.post(url, json=payload, headers=headers)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {json.dumps(response.json(), indent=2)}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"✓ Validation passed: is_valid={data['is_valid']}, confidence={data['confidence']}")
            return True
        else:
            print("✗ Validation failed")
            return False
    except Exception as e:
        print(f"✗ Error: {str(e)}")
        return False

def test_validation_invalid_auth():
    """Test validation with invalid credentials"""
    print("\n" + "="*60)
    print("TEST 3: Invalid Authentication")
    print("="*60)
    
    stroke_points = [{"x": 100.0, "y": 150.0, "t": 0, "p": 0.75} for _ in range(100)]
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
    
    # Wrong credentials
    credentials = "wrong_user:wrong_password"
    encoded = base64.b64encode(credentials.encode()).decode()
    headers = {
        "Authorization": f"Basic {encoded}",
        "Content-Type": "application/json"
    }
    
    url = f"{BASE_URL}/api/biometric/validate"
    print(f"POST {url}")
    print(f"Authorization: Basic wrong_user:***")
    
    try:
        response = requests.post(url, json=payload, headers=headers)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {json.dumps(response.json(), indent=2)}")
        
        if response.status_code == 401:
            print("✓ Correctly rejected invalid credentials")
            return True
        else:
            print("✗ Should have returned 401")
            return False
    except Exception as e:
        print(f"✗ Error: {str(e)}")
        return False

def test_validation_too_few_points():
    """Test validation with too few points"""
    print("\n" + "="*60)
    print("TEST 4: Too Few Points (< 100)")
    print("="*60)
    
    # Only 50 points (should fail)
    stroke_points = [{"x": 100.0, "y": 150.0, "t": i * 30, "p": 0.75} for i in range(50)]
    payload = {
        "normalized_stroke": stroke_points,
        "features": {
            "num_points": 50,
            "total_distance": 450.32,
            "velocity_mean": 2.54,
            "velocity_max": 5.82,
            "duration_ms": 1500
        }
    }
    
    url = f"{BASE_URL}/api/biometric/validate"
    headers = get_auth_header()
    headers["Content-Type"] = "application/json"
    
    print(f"POST {url}")
    print(f"Payload: {len(stroke_points)} points (too few)")
    
    try:
        response = requests.post(url, json=payload, headers=headers)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {json.dumps(response.json(), indent=2)}")
        
        if response.status_code == 422:  # Pydantic validation error
            print("✓ Correctly rejected too few points")
            return True
        else:
            print("✗ Should have returned 422")
            return False
    except Exception as e:
        print(f"✗ Error: {str(e)}")
        return False

def test_rate_limiting():
    """Test rate limiting (20 requests per minute)"""
    print("\n" + "="*60)
    print("TEST 5: Rate Limiting")
    print("="*60)
    
    stroke_points = [{"x": 100.0, "y": 150.0, "t": i * 15, "p": 0.75} for i in range(100)]
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
    
    url = f"{BASE_URL}/api/biometric/validate"
    headers = get_auth_header()
    headers["Content-Type"] = "application/json"
    
    print(f"Sending 22 requests (limit is 20)...")
    
    success_count = 0
    rate_limited = False
    
    try:
        for i in range(22):
            response = requests.post(url, json=payload, headers=headers)
            if response.status_code == 200:
                success_count += 1
            elif response.status_code == 429:
                print(f"Request {i+1}: Rate limited (429)")
                rate_limited = True
                break
            print(f"Request {i+1}: {response.status_code}")
        
        print(f"\nSuccessful requests: {success_count}")
        
        if rate_limited and success_count <= 20:
            print("✓ Rate limiting working correctly")
            return True
        else:
            print("✗ Rate limiting not working as expected")
            return False
    except Exception as e:
        print(f"✗ Error: {str(e)}")
        return False

def main():
    """Run all tests"""
    print("\n" + "="*60)
    print("CLOUD SERVICE API TESTS")
    print("="*60)
    print(f"Base URL: {BASE_URL}")
    print(f"Username: {USERNAME}")
    print(f"Password: ***")
    
    results = []
    
    # Run tests
    results.append(("Health Check", test_health()))
    results.append(("Valid Data", test_validation_valid_data()))
    results.append(("Invalid Auth", test_validation_invalid_auth()))
    results.append(("Too Few Points", test_validation_too_few_points()))
    # Note: Skip rate limiting test to avoid hitting the limit
    # results.append(("Rate Limiting", test_rate_limiting()))
    
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
        print("\n✓ All tests passed!")
    else:
        print(f"\n✗ {total - passed} test(s) failed")

if __name__ == "__main__":
    main()
