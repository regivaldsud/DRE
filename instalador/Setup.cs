using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

internal static class Setup
{
    internal const string AppName = "Dimensionamento de Fossa 6.0";
    private static readonly string Version = Assembly.GetExecutingAssembly().GetName().Version.ToString(3);

    [STAThread]
    private static void Main()
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        using (var gate = new Mutex(false, @"Local\DRE.Dimensionamento.Setup"))
        {
            bool acquired;
            try { acquired = gate.WaitOne(0); }
            catch (AbandonedMutexException) { acquired = true; }
            if (!acquired)
            {
                MessageBox.Show("A instalação já está em andamento.", "DRE " + Version);
                return;
            }
            try
            {
                using (var window = new SetupWindow())
                    Application.Run(window);
            }
            finally { gate.ReleaseMutex(); }
        }
    }

    internal static string Install(string programs, Action<int> progress)
    {
        string target = Path.Combine(programs, AppName);
        string exe = Path.Combine(target, AppName + ".exe");
        string suffix = Guid.NewGuid().ToString("N");
        string staged = target + ".novo-" + suffix;
        string backup = target + ".anterior-" + suffix;

        foreach (var process in Process.GetProcessesByName(AppName))
        {
            using (process)
            {
                string running;
                try { running = process.MainModule.FileName; }
                catch (System.ComponentModel.Win32Exception) { continue; }
                catch (InvalidOperationException) { continue; }
                if (String.Equals(running, exe, StringComparison.OrdinalIgnoreCase))
                    throw new IOException("Feche o DRE antes de instalar a atualização.");
            }
        }

        Directory.CreateDirectory(staged);
        try
        {
            using (var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("dre-payload.zip"))
            using (var archive = new ZipArchive(stream, ZipArchiveMode.Read))
            {
                int copied = 0;
                string root = Path.GetFullPath(staged) + Path.DirectorySeparatorChar;
                foreach (var entry in archive.Entries)
                {
                    string file = Path.GetFullPath(Path.Combine(staged, entry.FullName));
                    if (file != staged && !file.StartsWith(root, StringComparison.OrdinalIgnoreCase))
                        throw new IOException("O pacote contém um caminho inválido.");
                    if (String.IsNullOrEmpty(entry.Name))
                        Directory.CreateDirectory(file);
                    else
                    {
                        Directory.CreateDirectory(Path.GetDirectoryName(file));
                        entry.ExtractToFile(file);
                    }
                    progress(++copied * 90 / archive.Entries.Count);
                }
            }

            if (!File.Exists(Path.Combine(staged, AppName + ".exe")) ||
                !File.Exists(Path.Combine(staged, @"resources\app\js\vendor\three-svg-0.183.2.js")))
                throw new IOException("O pacote do DRE está incompleto.");

            bool hadPrevious = Directory.Exists(target);
            if (hadPrevious)
                Directory.Move(target, backup);
            try { Directory.Move(staged, target); }
            catch
            {
                if (hadPrevious)
                {
                    try { Directory.Move(backup, target); }
                    catch (IOException) { throw new IOException("A versão anterior foi preservada em " + backup); }
                    catch (UnauthorizedAccessException) { throw new IOException("A versão anterior foi preservada em " + backup); }
                }
                throw;
            }
            DeleteTemporary(backup);
            return exe;
        }
        finally { DeleteTemporary(staged); }
    }

    private static void DeleteTemporary(string path)
    {
        try { if (Directory.Exists(path)) Directory.Delete(path, true); }
        catch (IOException) { }
        catch (UnauthorizedAccessException) { }
    }

    internal static void CreateShortcut(string folder, string exe)
    {
        if (String.IsNullOrEmpty(folder)) throw new IOException("Pasta de atalhos indisponível.");
        Directory.CreateDirectory(folder);
        dynamic shell = Activator.CreateInstance(Type.GetTypeFromProgID("WScript.Shell"));
        string link = Path.Combine(folder, "Dimensionamento de Fossa " + Version + ".lnk");
        dynamic shortcut = shell.CreateShortcut(link);
        shortcut.TargetPath = exe;
        shortcut.WorkingDirectory = Path.GetDirectoryName(exe);
        shortcut.IconLocation = exe + ",0";
        shortcut.Description = "DRE " + Version + " · Dimensionamento de Fossa, Filtro e Sumidouro";
        shortcut.Save();
        foreach (string old in Directory.EnumerateFiles(folder, "Dimensionamento de Fossa *.lnk"))
        {
            if (String.Equals(old, link, StringComparison.OrdinalIgnoreCase) ||
                !Regex.IsMatch(Path.GetFileName(old), @"^Dimensionamento de Fossa \d+\.\d+(\.\d+)?\.lnk$"))
                continue;
            dynamic previous = shell.CreateShortcut(old);
            if (String.Equals((string)previous.TargetPath, exe, StringComparison.OrdinalIgnoreCase))
                File.Delete(old);
        }
    }

    private sealed class SetupWindow : Form
    {
        private readonly Label status;
        private readonly ProgressBar progress;
        private bool installing = true;

        internal SetupWindow()
        {
            Text = "Instalação do DRE " + Version;
            Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
            StartPosition = FormStartPosition.CenterScreen;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            AutoScaleMode = AutoScaleMode.Dpi;
            ClientSize = new Size(472, 146);
            BackColor = Color.White;
            Font = new Font("Segoe UI", 10);

            var title = new Label { Text = "Dimensionamento de Fossa", Font = new Font("Segoe UI", 17, FontStyle.Bold),
                AutoSize = true, Location = new Point(24, 20), ForeColor = Color.FromArgb(24, 48, 72) };
            status = new Label { Text = "Preparando a instalação…", AutoSize = true, Location = new Point(25, 69) };
            progress = new ProgressBar { Location = new Point(25, 106), Size = new Size(422, 13) };
            Controls.AddRange(new Control[] { title, status, progress });
            Shown += StartInstall;
            FormClosing += (sender, args) => { if (installing) args.Cancel = true; };
        }

        private async void StartInstall(object sender, EventArgs args)
        {
            var programs = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs");
            var reporter = new Progress<int>(value => { if (installing) progress.Value = value; });
            try
            {
                status.Text = "Instalando os arquivos do programa…";
                string exe = await Task.Run(() => Install(programs, ((IProgress<int>)reporter).Report));
                bool shortcutFailed = false;
                foreach (var folder in new[] { Environment.SpecialFolder.DesktopDirectory, Environment.SpecialFolder.Programs })
                {
                    try { CreateShortcut(Environment.GetFolderPath(folder), exe); }
                    catch (Exception) { shortcutFailed = true; }
                }
                progress.Value = 100;
                if (shortcutFailed)
                    MessageBox.Show(this, "O programa foi instalado. Um dos atalhos não pôde ser criado.\n" + exe,
                        Text, MessageBoxButtons.OK, MessageBoxIcon.Warning);
                Process.Start(new ProcessStartInfo(exe) { WorkingDirectory = Path.GetDirectoryName(exe), UseShellExecute = true });
            }
            catch (Exception error)
            {
                MessageBox.Show(this, error.Message, Text, MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            finally { installing = false; Close(); }
        }
    }
}
