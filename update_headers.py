import os
import re

directories = [
    'categories', 'fittings', 'colors', 'materials', 'uom', 'tax', 
    'payment-mode', 'payment-terms', 'currency-rate', 'location', 
    'warehouse', 'locator', 'despatch-terms'
]
base_path = r'c:\Users\yanna\digistorii\src\app\[company]\(user)\workspace\inventory'

for d in directories:
    file_path = os.path.join(base_path, d, 'page.tsx')
    if not os.path.exists(file_path):
        print(f'Skipping {file_path}, does not exist')
        continue
    
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Add imports
    if 'import Link from "next/link"' not in content:
        content = content.replace('"use client";', '"use client";\nimport Link from "next/link";\nimport { ArrowLeftIcon } from "@heroicons/react/24/outline";')

    # Try inline header replace
    inline_pattern = re.compile(r'({!showForm && \(\s*)(<button[^>]*>[\s\S]*?<PlusIcon[^>]*>[\s\S]*?Add [^<]*<\/button>\s*)(\)})')
    if inline_pattern.search(content):
        link_str = '<div className="flex items-center gap-3">\n          <Link className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors" href={`/${company}/workspace/administration/masters`}>\n            <ArrowLeftIcon className="w-4 h-4 text-gray-500"/>\n            Back to Masters\n          </Link>\n          '
        
        content = inline_pattern.sub(r'\g<1>' + link_str + r'\g<2></div>\n        \g<3>', content)
        print(f'Updated {d}/page.tsx inline header')
        
    elif 'function PageHeader' in content:
        headerRegex = re.compile(r'(function PageHeader\(\{.*?\}\) \{[\s\S]*?)({!showForm && \(\s*)(<button[\s\S]*?<\/button>\s*)(\)})')
        if headerRegex.search(content) and 'Back to Masters' not in content:
            def repl(m):
                p1 = re.sub(r'function PageHeader\(\{(.*?)\}\)', r'function PageHeader({\1, company}: any)', m.group(1))
                # Fallback if no type any in destructuring
                if 'any' not in p1 and 'company}: any' in p1:
                    pass # Handled roughly
                link_str = '<div className="flex items-center gap-3">\n          <Link className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors" href={`/${company}/workspace/administration/masters`}>\n            <ArrowLeftIcon className="w-4 h-4 text-gray-500"/>\n            Back to Masters\n          </Link>\n          '
                return p1 + m.group(2) + link_str + m.group(3) + '</div>\n      ' + m.group(4)
            content = headerRegex.sub(repl, content)
            
            # Pass company
            content = re.sub(r'(<PageHeader[^>]*)(>)', lambda m: m.group(1) + ' company={company} ' + m.group(2) if 'company=' not in m.group(1) else m.group(0), content)
            print(f'Updated {d}/page.tsx PageHeader')
    else:
        print(f'Could not find header pattern in {d}/page.tsx')
        
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
