import { useEditor, EditorContent, NodeViewWrapper, NodeViewContent, ReactNodeViewRenderer } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import Image from '@tiptap/extension-image';
import { TextStyle } from '@tiptap/extension-text-style';
import FontFamily from '@tiptap/extension-font-family';
import { Color } from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import { Node, mergeAttributes } from '@tiptap/core'; // Import from @tiptap/core

import { Button } from '@/components/ui/button';
import {
    Bold,
    Italic,
    Underline as UnderlineIcon,
    Strikethrough,
    List,
    ListOrdered,
    Link as LinkIcon,
    Quote,
    Undo,
    Redo,
    Type,
    Palette,
    StickyNote // Icon for the new feature
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEffect } from 'react';
import { Extension } from '@tiptap/core';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";

// --- CUSTOM NODE: NoteCard (Sticky Note) ---
const NoteCardComponent = () => {
    return (
        <NodeViewWrapper className="note-card-component my-4">
            <div className="bg-amber-100 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4 shadow-sm relative group">
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing text-amber-500" contentEditable={false} data-drag-handle>
                    <StickyNote className="w-4 h-4" />
                </div>
                <NodeViewContent className="content outline-none" />
            </div>
        </NodeViewWrapper>
    );
};

const NoteCardNode = Node.create({
    name: 'noteCard',
    group: 'block',
    content: 'block+', // Allow block content inside (like paragraphs, lists)
    draggable: true, // Make it draggable

    parseHTML() {
        return [
            {
                tag: 'note-card',
            },
            {
                tag: 'div',
                getAttrs: element => (element as HTMLElement).classList.contains('note-card-component') && null,
            }
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return ['note-card', mergeAttributes(HTMLAttributes), 0];
    },

    addNodeView() {
        return ReactNodeViewRenderer(NoteCardComponent);
    },

    addCommands() {
        return {
            setNoteCard: () => ({ commands }) => {
                return commands.wrapIn('noteCard');
            },
            toggleNoteCard: () => ({ commands }) => {
                return commands.toggleWrap('noteCard');
            },
        }
    }
});
// ------------------------------------------

// Custom Font Size Extension
const FontSize = Extension.create({
    name: 'fontSize',
    addOptions() {
        return {
            types: ['textStyle'],
        };
    },
    addGlobalAttributes() {
        return [
            {
                types: this.options.types,
                attributes: {
                    fontSize: {
                        default: null,
                        parseHTML: element => element.style.fontSize.replace('px', ''),
                        renderHTML: attributes => {
                            if (!attributes.fontSize) {
                                return {};
                            }
                            return {
                                style: `font-size: ${attributes.fontSize}px`,
                            };
                        },
                    },
                },
            },
        ];
    },
    addCommands() {
        return {
            setFontSize: fontSize => ({ chain }) => {
                return chain()
                    .setMark('textStyle', { fontSize })
                    .run();
            },
            unsetFontSize: () => ({ chain }) => {
                return chain()
                    .setMark('textStyle', { fontSize: null })
                    .removeEmptyTextStyle()
                    .run();
            },
        };
    },
});

// Configure extensions outside component
const EXTENSIONS = [
    StarterKit,
    Underline,
    Link.configure({
        openOnClick: false,
        autolink: true,
    }),
    Image.configure({
        inline: true,
        allowBase64: true,
    }),
    TextStyle,
    FontFamily,
    Color,
    Highlight.configure({
        multicolor: true,
    }),
    FontSize,
    NoteCardNode // Register Custom Node
];

interface RichTextEditorProps {
    content?: string | object;
    onChange: (content: object) => void;
    editable?: boolean;
}

export const RichTextEditor = ({ content, onChange, editable = true }: RichTextEditorProps) => {

    const editor = useEditor({
        extensions: EXTENSIONS,
        content: content || { type: 'doc', content: [] },
        editable,
        onUpdate: ({ editor }) => {
            onChange(editor.getJSON());
        },
        editorProps: {
            attributes: {
                class: 'prose prose-sm sm:prose-base focus:outline-none min-h-[300px] p-4 max-w-none dark:prose-invert',
            },
        },
    });

    useEffect(() => {
        if (editor && content) {
            const currentContent = editor.getJSON();
            // Fast check if they are different
            if (JSON.stringify(currentContent) !== JSON.stringify(content)) {
                // Update editor without emitting an update event to avoid infinite loop
                // We use setTimeout to ensure this runs cleanly out of the immediate render cycle
                setTimeout(() => {
                    editor.commands.setContent(content);
                }, 0);
            }
        }
    }, [content, editor]);

    if (!editor) {
        return null;
    }

    return (
        <div className="border border-border rounded-lg overflow-hidden bg-background flex flex-col h-full">
            {editable && (
                <div className="border-b border-border p-2 flex flex-wrap gap-1 bg-muted/30">
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => editor.chain().focus().toggleBold().run()}
                        className={cn("h-8 w-8 p-0", editor.isActive('bold') && "bg-secondary text-primary")}
                        title="Negrito"
                    >
                        <Bold className="h-4 w-4" />
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => editor.chain().focus().toggleItalic().run()}
                        className={cn("h-8 w-8 p-0", editor.isActive('italic') && "bg-secondary text-primary")}
                        title="Itálico"
                    >
                        <Italic className="h-4 w-4" />
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => editor.chain().focus().toggleUnderline().run()}
                        className={cn("h-8 w-8 p-0", editor.isActive('underline') && "bg-secondary text-primary")}
                        title="Sublinhado"
                    >
                        <UnderlineIcon className="h-4 w-4" />
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => editor.chain().focus().toggleStrike().run()}
                        className={cn("h-8 w-8 p-0", editor.isActive('strike') && "bg-secondary text-primary")}
                        title="Tachado"
                    >
                        <Strikethrough className="h-4 w-4" />
                    </Button>

                    <div className="w-px h-6 bg-border mx-1 my-auto" />

                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Cor do Texto">
                                <Palette className="h-4 w-4" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-40 p-2">
                            <div className="flex flex-wrap gap-1">
                                {['#000000', '#EF4444', '#F97316', '#F59E0B', '#10B981', '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899'].map(color => (
                                    <button
                                        key={color}
                                        onClick={() => editor.chain().focus().setColor(color).run()}
                                        className="w-6 h-6 rounded-full border border-border"
                                        style={{ backgroundColor: color }}
                                    />
                                ))}
                            </div>
                        </PopoverContent>
                    </Popover>

                    {/* Font Family */}
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Fonte">
                                <Type className="h-4 w-4" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-40 p-1">
                            <div className="flex flex-col">
                                <Button variant="ghost" size="sm" onClick={() => editor.chain().focus().setFontFamily('Inter').run()} className="justify-start font-sans">Inter</Button>
                                <Button variant="ghost" size="sm" onClick={() => editor.chain().focus().setFontFamily('serif').run()} className="justify-start font-serif">Serif</Button>
                                <Button variant="ghost" size="sm" onClick={() => editor.chain().focus().setFontFamily('monospace').run()} className="justify-start font-mono">Monospace</Button>
                                <Button variant="ghost" size="sm" onClick={() => editor.chain().focus().unsetFontFamily().run()} className="justify-start">Padrão</Button>
                            </div>
                        </PopoverContent>
                    </Popover>

                    <div className="w-px h-6 bg-border mx-1 my-auto" />

                    {/* Font Size */}
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-auto px-2 text-xs" title="Tamanho da Fonte">
                                <span className="mr-1">Tamanho</span>
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-20 p-1">
                            <div className="flex flex-col">
                                {[12, 14, 16, 18, 20, 24, 30, 36].map(size => (
                                    <Button
                                        key={size}
                                        variant="ghost"
                                        size="sm"
                                        // @ts-ignore
                                        onClick={() => editor.chain().focus().setFontSize(size).run()}
                                        className="justify-center h-7 text-xs"
                                    >
                                        {size}px
                                    </Button>
                                ))}
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    // @ts-ignore
                                    onClick={() => editor.chain().focus().unsetFontSize().run()}
                                    className="justify-center h-7 text-xs border-t mt-1"
                                >
                                    Auto
                                </Button>
                            </div>
                        </PopoverContent>
                    </Popover>

                    <div className="w-px h-6 bg-border mx-1 my-auto" />

                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        // @ts-ignore
                        onClick={() => editor.chain().focus().toggleNoteCard().run()}
                        className={cn("h-8 w-8 p-0", editor.isActive('noteCard') && "bg-secondary text-primary")}
                        title="Inserir Nota Adesiva"
                    >
                        <StickyNote className="h-4 w-4" />
                    </Button>

                    <div className="w-px h-6 bg-border mx-1 my-auto" />

                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => editor.chain().focus().toggleBulletList().run()}
                        className={cn("h-8 w-8 p-0", editor.isActive('bulletList') && "bg-secondary text-primary")}
                    >
                        <List className="h-4 w-4" />
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => editor.chain().focus().toggleOrderedList().run()}
                        className={cn("h-8 w-8 p-0", editor.isActive('orderedList') && "bg-secondary text-primary")}
                    >
                        <ListOrdered className="h-4 w-4" />
                    </Button>

                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => editor.chain().focus().toggleBlockquote().run()}
                        className={cn("h-8 w-8 p-0", editor.isActive('blockquote') && "bg-secondary text-primary")}
                    >
                        <Quote className="h-4 w-4" />
                    </Button>

                    <div className="w-px h-6 bg-border mx-1 my-auto" />

                    <div className="flex-1" />

                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => editor.chain().focus().undo().run()}
                        disabled={!editor.can().undo()}
                        className="h-8 w-8 p-0"
                    >
                        <Undo className="h-4 w-4" />
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => editor.chain().focus().redo().run()}
                        disabled={!editor.can().redo()}
                        className="h-8 w-8 p-0"
                    >
                        <Redo className="h-4 w-4" />
                    </Button>

                </div>
            )}
            <div className="flex-1 overflow-y-auto cursor-text bg-background" onClick={() => editor.chain().focus().run()}>
                <EditorContent editor={editor} className="h-full" />
            </div>
        </div>
    );
};
