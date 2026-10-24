// Renderiza el componente Swing real Summary Report sin necesidad de escritorio.
// Java -Djava.awt.headless=true -cp "JMETER/lib/*:JMETER/lib/ext/*" groovy.ui.GroovyMain ...
import org.apache.jmeter.util.JMeterUtils
import org.apache.jmeter.visualizers.SummaryReport
import org.apache.jmeter.samplers.SampleResult
import javax.swing.*
import java.awt.*
import java.awt.image.BufferedImage
import javax.imageio.ImageIO

JMeterUtils.setJMeterHome(args[0])
JMeterUtils.loadJMeterProperties(args[0] + '/bin/jmeter.properties')
JMeterUtils.setLocale(Locale.ENGLISH)
def lines = new File(args[1]).readLines('UTF-8')
def header = lines[0].split(',') as java.util.List
def samples = lines.drop(1).collect { line ->
    def values = line.split(',')
    def row = [header, values].transpose().collectEntries { pair -> [pair[0], pair[1]] }
    def result = new SampleResult(Long.parseLong(row.timeStamp), Long.parseLong(row.elapsed))
    result.setSampleLabel(row.label)
    result.setSuccessful(row.success == 'true')
    result.setBytes(Long.parseLong(row.bytes))
    result.setSentBytes(Long.parseLong(row.sentBytes))
    return result
}
SummaryReport report
SwingUtilities.invokeAndWait {
    UIManager.setLookAndFeel(UIManager.getCrossPlatformLookAndFeelClassName())
    report = new SummaryReport()
    report.setName('Summary Report')
    report.setSize(1450, 480)
    samples.each { report.add(it) }
}
Thread.sleep(1500)
// JMeter encola cambios en el EDT; esta segunda llamada espera a que se apliquen.
SwingUtilities.invokeAndWait {
    def layout
    layout = { Container component -> component.doLayout(); component.components.each { if (it instanceof Container) layout(it) } }
    def attachHeaders
    attachHeaders = { Container component ->
        if (component instanceof JScrollPane && component.viewport.view instanceof JTable) {
            component.setColumnHeaderView(component.viewport.view.tableHeader)
        }
        component.components.each { if (it instanceof Container) attachHeaders(it) }
    }
    attachHeaders(report)
    layout(report)
    def image = new BufferedImage(1450, 480, BufferedImage.TYPE_INT_RGB)
    def graphics = image.createGraphics()
    graphics.color = Color.WHITE; graphics.fillRect(0, 0, 1450, 480)
    report.printAll(graphics); graphics.dispose()
    ImageIO.write(image, 'png', new File(args[2]))
}
println('Summary Report renderizado desde el JTL: ' + args[2])
System.exit(0)
