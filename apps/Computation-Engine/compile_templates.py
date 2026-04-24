#!/usr/bin/env python3
"""
Compile templates directly to Computation Engine
Run this from within the Computation Engine environment
"""

import os
import sys
import requests
from pathlib import Path

# Add backend to path
backend_dir = Path(__file__).parent / "backend"
sys.path.insert(0, str(backend_dir))

# Load env
from dotenv import load_dotenv
load_dotenv()

COMPUTE_URL = "http://127.0.0.1:8000"
TOOLKITS_PATH = Path("C:/Users/Administrator/Downloads/BBBEE Toolkit-20260318T172641Z-1-001/BBBEE Toolkit/BBBEE Toolkits")

TEMPLATES = [
    {"sector": "RCOGP", "type": "Generic", "file": "1. RCOGP (Generic)/BBBEE Toolkit (RCOGP)_Template_v.1.4.xlsx"},
    {"sector": "RCOGP", "type": "QSE", "file": "4. RCOGP (QSE)/BBBEE Toolkit (RCOGP QSE)_Template_v.1.1.xlsx"},
    {"sector": "ICT", "type": "Generic", "file": "2. ICT (Generic)/BBBEE Toolkit (ICT Generic)_Template_v.1.4.xlsx"},
    {"sector": "ICT", "type": "QSE", "file": "3. ICT (QSE)/BBBEE Toolkit (ICT QSE)_Template_v.1.1.xlsx"},
    {"sector": "AGRI", "type": "Generic", "file": "6. Agri (Generic)/BBBEE Toolkit (Agri Generic)_Master_v.1.0.1.xlsx"},
    {"sector": "FSC", "type": "Generic", "file": "5. FSC (Generic)/BBBEE Toolkit (FSC) Template v1.0.xlsx"},
]

def compile_template(template):
    """Compile a single template"""
    file_path = TOOLKITS_PATH / template["file"]
    
    if not file_path.exists():
        print(f"❌ File not found: {file_path}")
        return None
    
    print(f"\n📄 {template['sector']}/{template['type']}")
    print(f"   File: {template['file']}")
    
    try:
        with open(file_path, 'rb') as f:
            file_data = f.read()
        
        file_name = Path(template["file"]).name
        
        # Prepare multipart form data
        files = {'file': (file_name, file_data, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}
        
        params = {
            'name': file_name,
            'metadata': str({
                'sectorCode': template['sector'],
                'scorecardType': template['type'],
            }).replace("'", '"')
        }
        
        headers = {'X-Admin': 'true'}
        
        print(f"   ⏳ Uploading {len(file_data) / 1024 / 1024:.2f} MB...")
        
        response = requests.post(
            f"{COMPUTE_URL}/admin/models/upload",
            files=files,
            params=params,
            headers=headers,
            timeout=300  # 5 minutes
        )
        
        if response.status_code == 200:
            result = response.json()
            print(f"   ✅ Compiled successfully")
            print(f"   Model ID: {result.get('version_id', 'N/A')}")
            print(f"   Cells: {result.get('cell_count', 0)} ({result.get('formula_count', 0)} formulas)")
            return result
        else:
            print(f"   ❌ Failed: {response.status_code} - {response.text[:200]}")
            return None
            
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return None

def main():
    print("=" * 70)
    print("Compile Templates to Computation Engine (Direct Python)")
    print("=" * 70)
    
    # Check if server is running
    try:
        response = requests.get(f"{COMPUTE_URL}/admin/models/list", headers={'X-Admin': 'true'}, timeout=5)
        if response.status_code == 200:
            models = response.json()
            print(f"\n✅ Computation Engine running ({len(models)} models already compiled)\n")
        else:
            print(f"\n❌ Computation Engine returned status {response.status_code}\n")
            return
    except Exception as e:
        print(f"\n❌ Cannot connect to Computation Engine: {e}")
        print(f"   Make sure it's running: py -3 run_server.py")
        return
    
    success_count = 0
    results = []
    
    for template in TEMPLATES:
        result = compile_template(template)
        if result:
            success_count += 1
            results.append({
                **template,
                "model_id": result.get('version_id')
            })
        
        # Small delay between uploads
        import time
        time.sleep(1)
    
    print("\n" + "=" * 70)
    print(f"Complete: {success_count}/{len(TEMPLATES)} templates compiled")
    print("=" * 70)
    
    if success_count > 0:
        print("\n✅ Templates compiled successfully!")
        print("\nModel IDs:")
        for r in results:
            print(f"  {r['sector']}/{r['type']}: {r['model_id']}")
        
        # Save results
        import json
        with open('compiled_models.json', 'w') as f:
            json.dump(results, f, indent=2)
        print("\nSaved to: compiled_models.json")
    else:
        print("\n⚠️ No templates compiled successfully")

if __name__ == "__main__":
    main()
