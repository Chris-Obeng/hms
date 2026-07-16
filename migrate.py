import os
import re

files_to_fix = [
    'app/dashboard/_components/activity-list.tsx',
    'app/dashboard/_components/dashboard-header.tsx',
    'app/dashboard/_components/occupancy-card.tsx',
    'app/dashboard/_components/quick-stats.tsx',
    'app/dashboard/availability/availability-matrix-client.tsx',
    'app/dashboard/bookings/[id]/booking-deep-link-client.tsx',
    'app/dashboard/bookings/new/page.tsx',
    'app/dashboard/calendar/_components/block-room-sheet.tsx',
    'app/dashboard/calendar/_components/booking-detail-panel.tsx',
    'app/dashboard/calendar/_components/unassigned-tray.tsx',
    'app/dashboard/calendar/calendar-client.tsx',
    'app/dashboard/dashboard-client.tsx',
    'app/dashboard/error.tsx',
    'app/dashboard/housekeeping/housekeeping-client.tsx',
    'app/dashboard/loading.tsx',
    'app/dashboard/payments/transactions/transactions-client.tsx',
    'app/dashboard/reports/reports-client.tsx',
    'components/ui/calendar.tsx'
]

for file_path in files_to_fix:
    if not os.path.exists(file_path):
        print(f"File not found: {file_path}")
        continue
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Remove old imports
    content = re.sub(r'import\s+{\s*Button\s*}\s+from\s+["\']@/components/ui/button["\'];\n?', '', content)
    content = re.sub(r'import\s+{\s*Badge\s*}\s+from\s+["\']@/components/ui/badge["\'];\n?', '', content)
    content = re.sub(r'import\s+{\s*Skeleton\s*}\s+from\s+["\']@/components/ui/skeleton["\'];\n?', '', content)
    content = re.sub(r'import\s+{\s*Separator\s*}\s+from\s+["\']@/components/ui/separator["\'];\n?', '', content)
    content = re.sub(r'import\s+{\s*Card.*?}\s+from\s+["\']@/components/ui/card["\'];\n?', '', content)
    content = re.sub(r'import\s+{\s*Tabs.*?}\s+from\s+["\']@/components/ui/tabs["\'];\n?', '', content)
    content = re.sub(r'import\s+{\s*Sheet.*?}\s+from\s+["\']@/components/ui/sheet["\'];\n?', '', content)
    
    # 2. Add HeroUI imports if not present, else append to existing
    heroui_imports = []
    if '<Button' in content: heroui_imports.append('Button')
    if '<Badge' in content: heroui_imports.append('Chip as Badge')
    if '<Skeleton' in content: heroui_imports.append('Skeleton')
    if '<Card' in content: heroui_imports.append('Card')
    if '<Separator' in content: heroui_imports.append('Separator')
    if '<Tabs' in content: heroui_imports.extend(['Tabs', 'Tab'])
    if '<Sheet' in content: heroui_imports.extend(['Drawer', 'DrawerContent', 'DrawerHeader', 'DrawerBody', 'DrawerFooter'])

    if heroui_imports:
        import_str = 'import { ' + ', '.join(heroui_imports) + ' } from "@heroui/react";\n'
        if 'import { ' in content and '"@heroui/react"' in content:
            # Already has HeroUI import, leave it mostly, maybe not smart enough to merge.
            pass 
        else:
            if '"use client";' in content:
                content = content.replace('"use client";', '"use client";\n' + import_str)
            else:
                content = import_str + content

    # 3. Swap props
    content = re.sub(r'<Button([^>]*)onClick=', r'<Button\1onPress=', content)
    content = re.sub(r'<Button([^>]*)disabled=', r'<Button\1isDisabled=', content)
    content = re.sub(r'<Button([^>]*)variant="outline"', r'<Button\1variant="bordered"', content)
    content = re.sub(r'<Button([^>]*)variant="default"', r'<Button\1variant="solid"', content)
    content = re.sub(r'<Button([^>]*)variant="destructive"', r'<Button\1color="danger"', content)

    # 4. Swap Badge variant outline -> secondary
    content = re.sub(r'<Badge([^>]*)variant="outline"', r'<Badge\1variant="secondary"', content)
    content = re.sub(r'<Badge([^>]*)variant="default"', r'<Badge\1variant="primary"', content)
    content = re.sub(r'<Badge([^>]*)variant="destructive"', r'<Badge\1color="danger"', content)
    content = re.sub(r'<Badge([^>]*)variant="secondary"', r'<Badge\1variant="secondary"', content)

    # 5. Swap Card components
    content = content.replace('<CardHeader', '<Card.Header').replace('</CardHeader>', '</Card.Header>')
    content = content.replace('<CardTitle', '<Card.Header').replace('</CardTitle>', '</Card.Header>')
    content = content.replace('<CardDescription', '<Card.Body').replace('</CardDescription>', '</Card.Body>')
    content = content.replace('<CardContent', '<Card.Body').replace('</CardContent>', '</Card.Body>')
    content = content.replace('<CardFooter', '<Card.Footer').replace('</CardFooter>', '</Card.Footer>')

    # 6. Swap Sheet components to Drawer (simple replacements, though useOverlayState might be needed, just doing components first)
    content = content.replace('<Sheet', '<Drawer').replace('</Sheet>', '</Drawer>')
    content = content.replace('<SheetContent', '<DrawerContent').replace('</SheetContent>', '</DrawerContent>')
    content = content.replace('<SheetHeader', '<DrawerHeader').replace('</SheetHeader>', '</DrawerHeader>')
    content = content.replace('<SheetTitle', '<DrawerHeader').replace('</SheetTitle>', '</DrawerHeader>')
    content = content.replace('<SheetDescription', '<DrawerBody').replace('</SheetDescription>', '</DrawerBody>')
    content = content.replace('<SheetFooter', '<DrawerFooter').replace('</SheetFooter>', '</DrawerFooter>')
    content = content.replace('<SheetClose', '<Button').replace('</SheetClose>', '</Button>')

    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f'Processed {file_path}')
