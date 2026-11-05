#define MyAppName "Master-Display"
#define MyAppFullTitle "Master-Display — Tören ve Sahne Reji Konsolu"
#define MyAppVersion "2.0.0"
#define MyAppPublisher "T.C. Millî Eğitim Bakanlığı - Mardin İl Millî Eğitim Müdürlüğü (Geliştirici: SERCAN ÖZDEMİR)"
#define MyAppURL "https://mardin.meb.gov.tr/"
#define MyAppDevURL "https://github.com/BeNKaYS"
#define MyAppExeName "master-display.exe"

[Setup]
AppId={{8F4B9A2E-5C71-4D83-9E12-6A3F0B8C7D91}
AppName={#MyAppFullTitle}
AppVersion={#MyAppVersion}
AppVerName={#MyAppFullTitle} v{#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppDevURL}
AppUpdatesURL={#MyAppDevURL}
AppCopyright=T.C. Millî Eğitim Bakanlığı - Mardin İl Millî Eğitim Müdürlüğü | SERCAN ÖZDEMİR
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppFullTitle}
AllowNoIcons=yes
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
OutputDir=..\Setup
OutputBaseFilename=Master-Display_Kurulum_Setup
SetupIconFile=assets\setup_icon.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
WizardStyle=modern
WizardSizePercent=115,115
WizardImageFile=assets\wizard_side.bmp
WizardSmallImageFile=assets\wizard_small.bmp
DisableWelcomePage=no
DisableDirPage=no
DisableProgramGroupPage=yes
SolidCompression=no
CloseApplications=yes

[Languages]
Name: "turkish"; MessagesFile: "compiler:Languages\Turkish.isl"

[Messages]
turkish.WelcomeLabel1=T.C. MİLLÎ EĞİTİM BAKANLIĞI%nMARDİN İL MİLLÎ EĞİTİM MÜDÜRLÜĞÜ
turkish.WelcomeLabel2=Master-Display (Tören ve Sahne Reji Konsolu) Kurulum Sihirbazına Hoş Geldiniz.%n%nBu uygulama, Mardin İl Millî Eğitim Müdürlüğü adına SERCAN ÖZDEMİR tarafından geliştirilmiştir.%n%nKuruluma devam etmek için İleri düğmesine tıklayın.
turkish.ClickNext=Devam etmek için İleri'ye, kurulumdan çıkmak için İptal'e tıklayın.
turkish.FinishedHeadingLabel=Master-Display Kurulumu Tamamlandı
turkish.FinishedLabel=Master-Display bilgisayarınıza başarıyla kuruldu.%n%nT.C. Millî Eğitim Bakanlığı — Mardin İl Millî Eğitim Müdürlüğü%nGeliştirici: SERCAN ÖZDEMİR

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[InstallDelete]
Type: filesandordirs; Name: "{app}\loop"
Type: filesandordirs; Name: "{app}\Beat"
Type: filesandordirs; Name: "{app}\t_Logo"
Type: filesandordirs; Name: "{localappdata}\com.masterdisplay.app\EBWebView"
Type: filesandordirs; Name: "{localappdata}\com.masterdisplay.app\media"
Type: filesandordirs; Name: "{userappdata}\com.masterdisplay.app"

[UninstallDelete]
Type: filesandordirs; Name: "{localappdata}\com.masterdisplay.app"
Type: filesandordirs; Name: "{userappdata}\com.masterdisplay.app"

[Files]
Source: "..\src-tauri\target\release\{#MyAppExeName}"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\src-tauri\icons\icon.ico"; DestDir: "{app}"; Flags: ignoreversion
Source: "assets\welcome_card.bmp"; Flags: dontcopy
Source: "..\Loop\01_Toren_Giris_ve_Karsilama\*"; DestDir: "{app}\loop\01_Toren_Giris_ve_Karsilama"; Flags: ignoreversion recursesubdirs createallsubdirs nocompression
Source: "..\Beat\01_Toren_Giris_ve_Karsilama\*"; DestDir: "{app}\Beat\01_Toren_Giris_ve_Karsilama"; Flags: ignoreversion recursesubdirs createallsubdirs nocompression
Source: "..\t_Logo\*"; DestDir: "{app}\t_Logo"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppFullTitle}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\icon.ico"
Name: "{group}\Mardin İl Millî Eğitim Müdürlüğü"; Filename: "{#MyAppURL}"
Name: "{group}\Geliştirici — SERCAN ÖZDEMİR (GitHub)"; Filename: "{#MyAppDevURL}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\icon.ico"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent

[Code]
var
  SplashCardImage: TBitmapImage;
  MemLinkLabel: TNewStaticText;
  DevLinkLabel: TNewStaticText;
  FooterCreditLabel: TNewStaticText;

procedure OpenMemUrl(Sender: TObject);
var
  ErrorCode: Integer;
begin
  ShellExec('open', '{#MyAppURL}', '', '', SW_SHOWNORMAL, ewNoWait, ErrorCode);
end;

procedure OpenDevUrl(Sender: TObject);
var
  ErrorCode: Integer;
begin
  ShellExec('open', '{#MyAppDevURL}', '', '', SW_SHOWNORMAL, ewNoWait, ErrorCode);
end;

procedure InitializeWizard;
begin
  ExtractTemporaryFile('welcome_card.bmp');

  { Karşılama sayfasını modal-welcome-splash kartıyla özelleştir }
  WizardForm.WelcomePage.Color := $EBF1F6;
  WizardForm.WizardBitmapImage.Visible := False;
  WizardForm.WelcomeLabel1.Visible := False;
  WizardForm.WelcomeLabel2.Visible := False;

  SplashCardImage := TBitmapImage.Create(WizardForm);
  SplashCardImage.Parent := WizardForm.WelcomePage;
  SplashCardImage.Left := ScaleX(12);
  SplashCardImage.Top := ScaleY(8);
  SplashCardImage.Width := WizardForm.WelcomePage.ClientWidth - ScaleX(24);
  SplashCardImage.Height := WizardForm.WelcomePage.ClientHeight - ScaleY(46);
  SplashCardImage.Stretch := True;
  SplashCardImage.Bitmap.LoadFromFile(ExpandConstant('{tmp}\welcome_card.bmp'));
  SplashCardImage.Anchors := [akLeft, akTop, akRight, akBottom];

  MemLinkLabel := TNewStaticText.Create(WizardForm);
  MemLinkLabel.Parent := WizardForm.WelcomePage;
  MemLinkLabel.Caption := '🌐 Mardin İl Millî Eğitim Müdürlüğü (mardin.meb.gov.tr)';
  MemLinkLabel.Left := ScaleX(20);
  MemLinkLabel.Top := WizardForm.WelcomePage.ClientHeight - ScaleY(30);
  MemLinkLabel.Font.Color := $B84A00;
  MemLinkLabel.Font.Style := [fsBold, fsUnderline];
  MemLinkLabel.Cursor := crHand;
  MemLinkLabel.OnClick := @OpenMemUrl;
  MemLinkLabel.Anchors := [akLeft, akBottom];

  DevLinkLabel := TNewStaticText.Create(WizardForm);
  DevLinkLabel.Parent := WizardForm.WelcomePage;
  DevLinkLabel.Caption := '💻 Geliştirici: SERCAN ÖZDEMİR (github.com/BeNKaYS)';
  DevLinkLabel.Left := WizardForm.WelcomePage.ClientWidth - ScaleX(295);
  DevLinkLabel.Top := WizardForm.WelcomePage.ClientHeight - ScaleY(30);
  DevLinkLabel.Font.Color := $7A2860;
  DevLinkLabel.Font.Style := [fsBold, fsUnderline];
  DevLinkLabel.Cursor := crHand;
  DevLinkLabel.OnClick := @OpenDevUrl;
  DevLinkLabel.Anchors := [akRight, akBottom];

  { Alt barda tüm kurulum adımlarında görünen kurumsal geliştirici imzası }
  FooterCreditLabel := TNewStaticText.Create(WizardForm);
  FooterCreditLabel.Parent := WizardForm;
  FooterCreditLabel.Caption := 'T.C. Millî Eğitim Bakanlığı • Mardin İl MEM | Geliştirici: SERCAN ÖZDEMİR';
  FooterCreditLabel.Left := ScaleX(16);
  FooterCreditLabel.Top := WizardForm.CancelButton.Top + ScaleY(6);
  FooterCreditLabel.Font.Color := $645040;
  FooterCreditLabel.Font.Style := [fsBold];
  FooterCreditLabel.Cursor := crHand;
  FooterCreditLabel.OnClick := @OpenDevUrl;
  FooterCreditLabel.Anchors := [akLeft, akBottom];
end;
