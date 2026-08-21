import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FileUpload } from '@/components/file-upload';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

const getMockFile = (name = 'quarterly-report.pdf') =>
  new File(['%PDF-1.7 fake'], name, { type: 'application/pdf' });

const getFileInput = () => screen.getByLabelText(/click to upload/i);

const dropFile = (file: File) => {
  // The drop handler lives on the surrounding drop zone; React's synthetic
  // events bubble, so dropping on the prompt text reaches it.
  fireEvent.drop(screen.getByText(/or drag and drop/i), {
    dataTransfer: { files: [file] },
  });
};

describe('Choosing a file to upload', () => {
  it('exposes the upload prompt as a labelled file input, not a second button', () => {
    render(<FileUpload />);

    expect(getFileInput()).toHaveAttribute('type', 'file');
    expect(screen.queryByRole('button', { name: /drag and drop/i })).not.toBeInTheDocument();
  });

  it('shows the name of the chosen file', async () => {
    render(<FileUpload />);

    await userEvent.upload(getFileInput(), getMockFile());

    expect(screen.getByText('quarterly-report.pdf')).toBeInTheDocument();
  });

  it('prefills the title with the file name minus its extension', async () => {
    render(<FileUpload />);

    await userEvent.upload(getFileInput(), getMockFile());

    expect(screen.getByLabelText(/document title/i)).toHaveValue('quarterly-report');
  });

  it('accepts a file dropped onto the upload area', () => {
    render(<FileUpload />);

    dropFile(getMockFile('dropped-contract.pdf'));

    expect(screen.getByText('dropped-contract.pdf')).toBeInTheDocument();
    expect(screen.getByLabelText(/document title/i)).toHaveValue('dropped-contract');
  });

  it('lets the user discard the chosen file and start over', async () => {
    render(<FileUpload />);
    await userEvent.upload(getFileInput(), getMockFile());

    await userEvent.click(screen.getByRole('button', { name: /choose different file/i }));

    expect(screen.queryByText('quarterly-report.pdf')).not.toBeInTheDocument();
    expect(getFileInput()).toBeInTheDocument();
  });
});

describe('Upload readiness', () => {
  it('cannot be submitted before a file is chosen', () => {
    render(<FileUpload />);

    expect(screen.getByRole('button', { name: /upload document/i })).toBeDisabled();
  });

  it('can be submitted once a file supplies a title', async () => {
    render(<FileUpload />);

    await userEvent.upload(getFileInput(), getMockFile());

    expect(screen.getByRole('button', { name: /upload document/i })).toBeEnabled();
  });

  it('cannot be submitted when the title has been cleared', async () => {
    render(<FileUpload />);
    await userEvent.upload(getFileInput(), getMockFile());

    await userEvent.clear(screen.getByLabelText(/document title/i));

    expect(screen.getByRole('button', { name: /upload document/i })).toBeDisabled();
  });
});
