import "./globals.css";

export const metadata = {
  title: "Bronco Cache Flashcards",
  description: "A minimal flashcard study app backed by SQLite",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <div className="container">{children}</div>
      </body>
    </html>
  );
}
