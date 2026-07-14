import os

file_path = 'app/dashboard/calendar/_components/booking-detail-panel.tsx'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace imports
content = content.replace(
    'import {\n  Sheet,\n  SheetContent,\n  SheetHeader,\n  SheetTitle,\n  SheetDescription,\n} from "@/components/ui/sheet";\nimport { Button } from "@/components/ui/button";',
    'import { Button, Drawer } from "@heroui/react";'
)

# Replace Sheet opening
content = content.replace(
    '<Sheet open={open} onOpenChange={(val) => !val && onClose()}>',
    '<Drawer.Backdrop isOpen={open} onOpenChange={(val) => !val && onClose()}>'
)

content = content.replace(
    '<SheetContent\n        side="right"\n        className="w-full sm:max-w-lg p-0 flex flex-col"\n      >',
    '<Drawer.Content\n        placement="right"\n        className="w-full sm:max-w-lg p-0 flex flex-col"\n      >\n        <Drawer.Dialog className="flex-1 flex flex-col min-h-0">'
)

# Header replacements
content = content.replace('<SheetHeader', '<Drawer.Header')
content = content.replace('</SheetHeader>', '</Drawer.Header>\n        <Drawer.Body className="p-0 flex-1 overflow-hidden">')

content = content.replace('<SheetTitle', '<Drawer.Heading')
content = content.replace('</SheetTitle>', '</Drawer.Heading>')

content = content.replace('<SheetDescription', '<p')
content = content.replace('</SheetDescription>', '</p>')

# End of file closing tags
content = content.replace(
    '</Tabs>\n        </div>\n      </SheetContent>\n    </Sheet>',
    '</Tabs>\n        </div>\n        </Drawer.Body>\n        </Drawer.Dialog>\n      </Drawer.Content>\n    </Drawer.Backdrop>'
)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Replaced!")
